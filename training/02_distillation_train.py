"""
FaceShield Edge — Step 2: Knowledge Distillation Training
==========================================================
Trains MobileFaceNet (student) to mimic ArcFace/ResNet-50 (teacher).

Distillation loss:
    L = λ₁ × ArcFace_classification_loss
      + λ₂ × Embedding_alignment_loss (MSE between teacher/student embeddings)

λ₁ = 0.5, λ₂ = 0.5  (as per FaceShield spec)

The teacher model is NEVER deployed to mobile — training machine only.

Usage:
    python 02_distillation_train.py \
        --data_dir /data/faceshield_india \
        --teacher_weights /models/arcface_resnet50.h5 \
        --output_dir /models/faceshield_student \
        --epochs 30 \
        --batch_size 64
"""

import argparse
import os
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model, optimizers, losses
from tensorflow.keras.applications import ResNet50
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tqdm import tqdm

# ── MobileFaceNet Architecture ────────────────────────────────────────────────
def build_mobilefacenet(embedding_dim: int = 128) -> Model:
    """
    MobileFaceNet — lightweight face recognition backbone.
    Input: 112×112×3  Output: 128-dim L2-normalised embedding
    ~5MB at FP32, ~1.4MB at INT8
    """
    base = tf.keras.applications.MobileNetV2(
        input_shape=(112, 112, 3),
        include_top=False,
        weights='imagenet',
        alpha=0.35,          # smallest MobileNetV2 variant
    )

    inputs = tf.keras.Input(shape=(112, 112, 3))
    x = base(inputs, training=True)

    # Depthwise separable convolution head (MobileFaceNet-specific)
    x = layers.DepthwiseConv2D(kernel_size=7, strides=1,
                                padding='valid', use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(embedding_dim, kernel_size=1, strides=1,
                      padding='valid', use_bias=False)(x)
    x = layers.BatchNormalization()(x)
    x = layers.Flatten()(x)

    # L2 normalisation
    embeddings = layers.Lambda(
        lambda t: tf.math.l2_normalize(t, axis=1),
        name='l2_norm'
    )(x)

    return Model(inputs, embeddings, name='MobileFaceNet')


def build_arcface_teacher(num_classes: int, weights_path: str | None) -> Model:
    """
    ArcFace teacher: ResNet-50 backbone + classification head.
    Runs on training machine only — never deployed to mobile.
    """
    base = ResNet50(input_shape=(112, 112, 3), include_top=False, weights='imagenet')

    inputs = tf.keras.Input(shape=(112, 112, 3))
    x = base(inputs, training=False)   # freeze teacher
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(512, activation='relu')(x)
    embeddings = layers.Lambda(
        lambda t: tf.math.l2_normalize(t, axis=1),
        name='teacher_embed'
    )(x)
    logits = layers.Dense(num_classes, name='logits')(embeddings)

    model = Model(inputs, [embeddings, logits], name='ArcFace_Teacher')

    if weights_path and Path(weights_path).exists():
        model.load_weights(weights_path)
        print(f"Loaded teacher weights from {weights_path}")
    else:
        print("Warning: no teacher weights provided — using ImageNet init only")

    # Freeze teacher completely
    model.trainable = False
    return model


# ── Dataset loader ─────────────────────────────────────────────────────────────
def build_dataset(data_dir: str, batch_size: int, split: str = 'train'):
    datagen = ImageDataGenerator(
        rescale=1.0 / 255.0,
        validation_split=0.1,
    )
    return datagen.flow_from_directory(
        data_dir,
        target_size=(112, 112),
        batch_size=batch_size,
        class_mode='categorical',
        subset=split,
        shuffle=(split == 'training'),
    )


# ── Distillation Training Step ─────────────────────────────────────────────────
@tf.function
def distillation_step(images, labels, teacher, student, optimizer,
                       num_classes: int, lambda1: float = 0.5, lambda2: float = 0.5):
    with tf.GradientTape() as tape:
        # Teacher forward pass (no gradient)
        teacher_embeds, teacher_logits = teacher(images, training=False)

        # Student forward pass
        student_embeds = student(images, training=True)

        # ── Loss 1: ArcFace classification loss (hard labels) ──────────
        # Additive Angular Margin — approximate via cross-entropy for distillation
        student_logits = tf.matmul(student_embeds,
                                   tf.transpose(teacher.get_layer('logits').kernel))
        ce_loss = losses.categorical_crossentropy(labels, student_logits,
                                                   from_logits=True)

        # ── Loss 2: Embedding alignment loss (soft knowledge) ──────────
        align_loss = tf.reduce_mean(
            tf.reduce_sum(tf.square(teacher_embeds - student_embeds), axis=1)
        )

        # ── Combined distillation loss ──────────────────────────────────
        total_loss = lambda1 * ce_loss + lambda2 * align_loss

    gradients = tape.gradient(total_loss, student.trainable_variables)
    optimizer.apply_gradients(zip(gradients, student.trainable_variables))
    return total_loss, ce_loss, align_loss


def train(args):
    print("=" * 60)
    print("FaceShield Edge — Knowledge Distillation Training")
    print("=" * 60)

    # Count classes (identities)
    data_dir = Path(args.data_dir)
    num_classes = len([d for d in data_dir.iterdir() if d.is_dir()])
    print(f"Identities: {num_classes}")

    # Build models
    teacher = build_arcface_teacher(num_classes, args.teacher_weights)
    student = build_mobilefacenet(embedding_dim=128)
    student.summary()

    # Optimizer — cosine decay LR schedule
    lr_schedule = optimizers.schedules.CosineDecay(
        initial_learning_rate=1e-3,
        decay_steps=args.epochs * 1000,
    )
    optimizer = optimizers.Adam(learning_rate=lr_schedule)

    # Datasets
    train_gen = build_dataset(args.data_dir, args.batch_size, 'training')
    val_gen   = build_dataset(args.data_dir, args.batch_size, 'validation')

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    best_val_loss = float('inf')

    for epoch in range(args.epochs):
        print(f"\nEpoch {epoch + 1}/{args.epochs}")
        epoch_losses = []

        for batch_images, batch_labels in tqdm(train_gen, desc="Training"):
            batch_images = tf.cast(batch_images, tf.float32)
            loss, ce, align = distillation_step(
                batch_images, batch_labels, teacher, student,
                optimizer, num_classes, args.lambda1, args.lambda2,
            )
            epoch_losses.append(float(loss))

        mean_loss = np.mean(epoch_losses)
        print(f"  Train loss: {mean_loss:.4f}")

        # Validation
        val_losses = []
        for val_images, val_labels in val_gen:
            teacher_embeds, _ = teacher(val_images, training=False)
            student_embeds = student(val_images, training=False)
            val_align = float(tf.reduce_mean(
                tf.reduce_sum(tf.square(teacher_embeds - student_embeds), axis=1)
            ))
            val_losses.append(val_align)
        mean_val = np.mean(val_losses)
        print(f"  Val align loss: {mean_val:.4f}")

        # Save best checkpoint
        if mean_val < best_val_loss:
            best_val_loss = mean_val
            student.save(str(output_dir / 'student_best.h5'))
            print(f"  ✅ Saved best model (val_loss={mean_val:.4f})")

    # Save final model
    student.save(str(output_dir / 'student_final.h5'))
    print(f"\nTraining complete. Best val loss: {best_val_loss:.4f}")
    print(f"Model saved to: {output_dir}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='FaceShield distillation training')
    parser.add_argument('--data_dir', type=str, required=True)
    parser.add_argument('--teacher_weights', type=str, default=None)
    parser.add_argument('--output_dir', type=str, default='/models/faceshield_student')
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--batch_size', type=int, default=64)
    parser.add_argument('--lambda1', type=float, default=0.5,
                        help='Weight for classification loss')
    parser.add_argument('--lambda2', type=float, default=0.5,
                        help='Weight for embedding alignment loss')
    args = parser.parse_args()
    train(args)
