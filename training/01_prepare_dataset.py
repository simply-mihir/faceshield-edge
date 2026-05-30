"""
FaceShield Edge — Step 1: Dataset Preparation
==============================================
Filters VGGFace2 for South Asian identities and applies outdoor
lighting augmentations to simulate Indian field conditions.

Input:  VGGFace2 dataset directory (--vgg_dir)
Output: Filtered + augmented dataset ready for distillation (--out_dir)

Usage:
    python 01_prepare_dataset.py \
        --vgg_dir /data/vggface2 \
        --out_dir /data/faceshield_india \
        --target_identities 10000 \
        --augment_factor 5
"""

import argparse
import os
import shutil
import random
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm
import albumentations as A

# ── South Asian identity keywords in VGGFace2 labels ─────────────────────────
# VGGFace2 uses nationality tags — filter these for South Asian demographics
SOUTH_ASIAN_COUNTRIES = {
    'IN', 'PK', 'BD', 'LK', 'NP', 'BT',   # ISO codes in some metadata
    'Indian', 'Pakistani', 'Bangladeshi', 'Sri Lankan',
}

# ── Outdoor lighting augmentation pipeline ────────────────────────────────────
def build_augmentation_pipeline() -> A.Compose:
    """
    Simulates Indian field conditions:
    - Harsh direct sunlight (high brightness, colour cast)
    - Deep shadows (low brightness regions)
    - Low light / dusk (gamma shift)
    - Motion blur from handheld devices
    - Facial hair and accessory variations (dropout regions)
    """
    return A.Compose([
        # Lighting variations
        A.OneOf([
            # Harsh sunlight: overexposed highlights
            A.RandomBrightnessContrast(brightness_limit=(0.3, 0.6),
                                       contrast_limit=(0.1, 0.3), p=1.0),
            # Low light / shade
            A.RandomBrightnessContrast(brightness_limit=(-0.5, -0.2),
                                       contrast_limit=(-0.2, 0.0), p=1.0),
            # Dusk / golden hour (warm colour cast)
            A.RGBShift(r_shift_limit=30, g_shift_limit=10,
                       b_shift_limit=-20, p=1.0),
        ], p=0.8),

        # Shadow simulation
        A.RandomShadow(shadow_roi=(0, 0, 1, 1),
                       num_shadows_lower=1, num_shadows_upper=2,
                       shadow_dimension=5, p=0.4),

        # Camera effects
        A.OneOf([
            A.MotionBlur(blur_limit=5, p=1.0),
            A.GaussianBlur(blur_limit=(3, 5), p=1.0),
            A.GaussNoise(var_limit=(10, 40), p=1.0),
        ], p=0.3),

        # Pose / orientation
        A.HorizontalFlip(p=0.5),
        A.Rotate(limit=15, p=0.4),

        # Colour normalisation variation (simulates different white balance)
        A.HueSaturationValue(hue_shift_limit=10,
                             sat_shift_limit=20,
                             val_shift_limit=20, p=0.4),

        # JPEG compression artefacts (low-end phone cameras)
        A.ImageCompression(quality_lower=60, quality_upper=95, p=0.3),

        # Final resize to MobileFaceNet input size
        A.Resize(112, 112),
    ])


def load_south_asian_identities(vgg_dir: Path, target_n: int) -> list[str]:
    """
    Attempt to filter South Asian identities from VGGFace2.
    Falls back to random sampling if metadata is unavailable.
    """
    meta_path = vgg_dir / 'meta' / 'identity_meta.csv'
    identities = []

    if meta_path.exists():
        import pandas as pd
        meta = pd.read_csv(meta_path)
        # Filter by nationality/flag columns if present
        if 'Country_of_Birth' in meta.columns:
            sa = meta[meta['Country_of_Birth'].str.upper().isin(SOUTH_ASIAN_COUNTRIES)]
            identities = sa['Class_ID'].tolist()
            print(f"Found {len(identities)} South Asian identities in metadata")

    if len(identities) < target_n:
        # Supplement with random identities from the full dataset
        all_ids = [d.name for d in (vgg_dir / 'data').iterdir() if d.is_dir()]
        random.shuffle(all_ids)
        supplement = [i for i in all_ids if i not in identities]
        identities += supplement[:target_n - len(identities)]
        print(f"Supplemented to {len(identities)} identities (South Asian + random)")

    return identities[:target_n]


def prepare_dataset(vgg_dir: Path, out_dir: Path,
                    target_identities: int, augment_factor: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    augment = build_augmentation_pipeline()

    identities = load_south_asian_identities(vgg_dir, target_identities)
    print(f"\nPreparing {len(identities)} identities → {out_dir}")

    total_images = 0
    for identity_id in tqdm(identities, desc="Processing identities"):
        src_dir = vgg_dir / 'data' / identity_id
        if not src_dir.exists():
            continue

        dst_dir = out_dir / identity_id
        dst_dir.mkdir(exist_ok=True)

        images = list(src_dir.glob('*.jpg')) + list(src_dir.glob('*.png'))
        if not images:
            continue

        for img_path in images:
            img = cv2.imread(str(img_path))
            if img is None:
                continue

            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

            # Save original
            cv2.imwrite(str(dst_dir / img_path.name), img)
            total_images += 1

            # Save augmented copies
            for aug_i in range(augment_factor - 1):
                augmented = augment(image=img_rgb)['image']
                aug_bgr = cv2.cvtColor(augmented, cv2.COLOR_RGB2BGR)
                aug_name = f"{img_path.stem}_aug{aug_i}{img_path.suffix}"
                cv2.imwrite(str(dst_dir / aug_name), aug_bgr)
                total_images += 1

    print(f"\nDataset ready: {len(identities)} identities, {total_images:,} images")
    print(f"Output: {out_dir}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Prepare FaceShield training dataset')
    parser.add_argument('--vgg_dir', type=Path, required=True,
                        help='VGGFace2 root directory')
    parser.add_argument('--out_dir', type=Path,
                        default=Path('/data/faceshield_india'),
                        help='Output directory for prepared dataset')
    parser.add_argument('--target_identities', type=int, default=10000,
                        help='Number of identities to include (default: 10000)')
    parser.add_argument('--augment_factor', type=int, default=5,
                        help='Augmentation multiplier per image (default: 5)')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    prepare_dataset(args.vgg_dir, args.out_dir,
                    args.target_identities, args.augment_factor)
