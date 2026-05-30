"""
FaceShield Edge — Step 3: INT8 Quantisation → TFLite
=====================================================
Converts the trained Keras student model to INT8 TFLite.

Expected size reduction: FP32 ~20MB → INT8 ~5MB (75% reduction)
Expected speedup: 2–3× on ARM with NNAPI delegation

Usage:
    python 03_quantise_tflite.py \
        --model_path /models/faceshield_student/student_best.h5 \
        --data_dir /data/faceshield_india \
        --output_path assets/models/mobilefacenet_india_int8.tflite
"""

import argparse
import os
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator

REPR_DATASET_SIZE = 200   # samples for calibration


def representative_dataset_gen(data_dir: str):
    """
    Yields representative face images for INT8 calibration.
    TFLite converter uses these to determine quantisation ranges.
    """
    datagen = ImageDataGenerator(rescale=1.0 / 255.0)
    gen = datagen.flow_from_directory(
        data_dir,
        target_size=(112, 112),
        batch_size=1,
        class_mode=None,
        shuffle=True,
    )
    count = 0
    for img_batch in gen:
        yield [img_batch.astype(np.float32)]
        count += 1
        if count >= REPR_DATASET_SIZE:
            break


def quantise(model_path: str, data_dir: str, output_path: str) -> None:
    print("=" * 60)
    print("FaceShield Edge — INT8 TFLite Quantisation")
    print("=" * 60)

    # Load trained Keras model
    model = tf.keras.models.load_model(model_path)
    print(f"Loaded model from: {model_path}")
    print(f"Model parameters: {model.count_params():,}")

    # Convert to TFLite with full INT8 quantisation
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    # Enable full INT8 quantisation (weights + activations)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = lambda: representative_dataset_gen(data_dir)
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS_INT8,
    ]
    converter.inference_input_type  = tf.uint8
    converter.inference_output_type = tf.float32  # keep float output for cosine similarity

    print("\nRunning INT8 quantisation (this may take a few minutes)...")
    tflite_model = converter.convert()

    # Save
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(tflite_model)

    size_mb = len(tflite_model) / (1024 * 1024)
    print(f"\n✅ Quantised model saved: {output_path}")
    print(f"   Size: {size_mb:.2f} MB")

    # Quick sanity check: run inference on a random input
    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    input_details  = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    dummy = np.random.randint(0, 255, (1, 112, 112, 3), dtype=np.uint8)
    interpreter.set_tensor(input_details[0]['index'], dummy)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])

    print(f"   Embedding shape: {output.shape}  (expected [1, 128])")
    print(f"   Embedding norm:  {np.linalg.norm(output):.4f}  (expected ~1.0)")

    if size_mb > 15:
        print(f"\n⚠️  WARNING: Model size {size_mb:.1f}MB exceeds 15MB target.")
        print("   Consider reducing alpha in MobileFaceNet or embedding_dim.")
    else:
        print(f"\n✅ Model size {size_mb:.1f}MB — within 15MB target (spec: <20MB)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Quantise model to INT8 TFLite')
    parser.add_argument('--model_path', type=str, required=True,
                        help='Path to trained .h5 Keras model')
    parser.add_argument('--data_dir', type=str, required=True,
                        help='Dataset dir for representative calibration samples')
    parser.add_argument('--output_path', type=str,
                        default='assets/models/mobilefacenet_india_int8.tflite',
                        help='Output TFLite model path')
    args = parser.parse_args()
    quantise(args.model_path, args.data_dir, args.output_path)
