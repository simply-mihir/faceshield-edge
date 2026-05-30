"""
FaceShield Edge — Step 4: Cosine Similarity Threshold Calibration
=================================================================
Runs ROC analysis on a held-out Indian-demographic validation set to
find the Equal Error Rate (EER) threshold and recommended operating point.

Outputs:
    - ROC curve plot (PNG)
    - threshold_report.json  (EER threshold + recommended 0.68 operating point)
    - Confusion matrix at recommended threshold

Usage:
    python 04_calibrate_threshold.py \
        --model_path assets/models/mobilefacenet_india_int8.tflite \
        --val_dir /data/faceshield_india_val \
        --output_dir calibration_results
"""

import argparse
import json
import os
from itertools import combinations
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import roc_curve, auc, confusion_matrix
from tqdm import tqdm
import tensorflow as tf


# ── Embedding extraction ───────────────────────────────────────────────────────

def load_interpreter(tflite_path: str):
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    return interpreter, interpreter.get_input_details(), interpreter.get_output_details()


def extract_embedding(interpreter, input_details, output_details,
                      img_uint8: np.ndarray) -> np.ndarray:
    """
    Runs INT8 TFLite inference.
    img_uint8: shape (112, 112, 3), dtype uint8
    Returns: 128-dim float32 L2-normalised embedding
    """
    tensor = img_uint8[np.newaxis, ...]   # (1, 112, 112, 3)
    interpreter.set_tensor(input_details[0]['index'], tensor)
    interpreter.invoke()
    emb = interpreter.get_tensor(output_details[0]['index'])[0]  # (128,)
    # L2 re-normalise (already done inside model but ensure precision)
    norm = np.linalg.norm(emb)
    return emb / (norm + 1e-8)


def load_images_from_dir(identity_dir: Path, target_size=(112, 112)) -> list[np.ndarray]:
    """Loads all images for one identity as uint8 arrays."""
    imgs = []
    for img_path in sorted(identity_dir.glob('*.jpg')) + sorted(identity_dir.glob('*.png')):
        img = tf.keras.utils.load_img(img_path, target_size=target_size)
        imgs.append(np.array(img, dtype=np.uint8))
    return imgs


# ── Pair generation ────────────────────────────────────────────────────────────

def build_pairs(val_dir: Path, max_pairs_per_identity: int = 50):
    """
    Genuine pairs: same identity, all combinations up to max_pairs_per_identity
    Impostor pairs: different identities, random sample equal to genuine count
    Returns:
        pairs: list of (emb1, emb2, label)   label=1 genuine, 0 impostor
    """
    identity_dirs = [d for d in val_dir.iterdir() if d.is_dir()]
    print(f"Identities in validation set: {len(identity_dirs)}")

    all_embeddings: dict[str, list[np.ndarray]] = {}
    return identity_dirs, all_embeddings  # just structure — filled in main()


# ── ROC + EER ─────────────────────────────────────────────────────────────────

def compute_eer(fpr: np.ndarray, tpr: np.ndarray, thresholds: np.ndarray):
    """
    Equal Error Rate: point where FPR ≈ FNR (= 1 − TPR).
    Returns (eer_value, eer_threshold)
    """
    fnr = 1.0 - tpr
    abs_diff = np.abs(fpr - fnr)
    idx = np.argmin(abs_diff)
    eer = (fpr[idx] + fnr[idx]) / 2.0
    return float(eer), float(thresholds[idx])


def plot_roc(fpr, tpr, roc_auc, eer, eer_threshold,
             recommended_threshold, output_dir: Path):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # ROC curve
    ax = axes[0]
    ax.plot(fpr, tpr, color='royalblue', lw=2,
            label=f'ROC (AUC = {roc_auc:.4f})')
    ax.plot([0, 1], [0, 1], color='grey', linestyle='--', lw=1)
    ax.axvline(x=eer, color='red', linestyle=':', lw=1.5, label=f'EER = {eer:.4f}')
    ax.set_xlabel('False Positive Rate', fontsize=12)
    ax.set_ylabel('True Positive Rate', fontsize=12)
    ax.set_title('ROC Curve — FaceShield India Validation', fontsize=13)
    ax.legend(loc='lower right')
    ax.grid(True, alpha=0.3)

    # Score distribution (FPR/FNR vs threshold)
    ax2 = axes[1]
    fnr = 1.0 - tpr
    # Only plot where thresholds is in [0, 1] (cosine similarity range)
    mask = (fpr >= 0) & (tpr >= 0)
    ax2.plot(fpr[mask], tpr[mask] * 0 + 0, alpha=0)  # dummy for spacing
    ax2.plot(fpr, label='FPR', color='tomato', lw=2)
    ax2.plot(fnr, label='FNR', color='steelblue', lw=2)
    ax2.axvline(x=np.searchsorted(-fpr, -eer), color='red',
                linestyle=':', lw=1.5, label=f'EER threshold={eer_threshold:.3f}')
    ax2.set_xlabel('Threshold index (ascending)', fontsize=12)
    ax2.set_ylabel('Error Rate', fontsize=12)
    ax2.set_title('FPR / FNR Trade-off', fontsize=13)
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = output_dir / 'roc_curve.png'
    plt.savefig(str(out_path), dpi=150)
    plt.close()
    print(f"ROC curve saved: {out_path}")


# ── Main ───────────────────────────────────────────────────────────────────────

def calibrate(args):
    print("=" * 60)
    print("FaceShield Edge — Threshold Calibration")
    print("=" * 60)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    val_dir = Path(args.val_dir)
    identity_dirs = [d for d in sorted(val_dir.iterdir()) if d.is_dir()]
    print(f"Identities found: {len(identity_dirs)}")

    # Load TFLite model
    interpreter, in_det, out_det = load_interpreter(args.model_path)

    # Extract embeddings per identity
    print("\nExtracting embeddings...")
    id_embeddings: dict[str, list[np.ndarray]] = {}
    for id_dir in tqdm(identity_dirs, desc="Identities"):
        imgs = load_images_from_dir(id_dir)
        if len(imgs) < 2:
            continue   # need ≥2 for genuine pairs
        embs = [extract_embedding(interpreter, in_det, out_det, img) for img in imgs]
        id_embeddings[id_dir.name] = embs

    identity_names = list(id_embeddings.keys())
    print(f"Usable identities (≥2 images): {len(identity_names)}")

    # Build genuine pairs
    genuine_scores = []
    for name, embs in id_embeddings.items():
        pairs = list(combinations(range(len(embs)), 2))
        np.random.shuffle(pairs)
        for i, j in pairs[:args.max_pairs_per_identity]:
            score = float(np.dot(embs[i], embs[j]))   # L2-normed → cosine = dot product
            genuine_scores.append(score)

    # Build impostor pairs (random across identities)
    impostor_scores = []
    n_impostors = len(genuine_scores)
    rng = np.random.default_rng(args.seed)
    id_array = np.array(identity_names)
    while len(impostor_scores) < n_impostors:
        a, b = rng.choice(len(id_array), size=2, replace=False)
        embs_a = id_embeddings[id_array[a]]
        embs_b = id_embeddings[id_array[b]]
        i = rng.integers(len(embs_a))
        j = rng.integers(len(embs_b))
        score = float(np.dot(embs_a[i], embs_b[j]))
        impostor_scores.append(score)

    print(f"\nGenuine pairs:  {len(genuine_scores)}")
    print(f"Impostor pairs: {len(impostor_scores)}")

    # ROC analysis
    labels  = np.array([1] * len(genuine_scores) + [0] * len(impostor_scores))
    scores  = np.array(genuine_scores + impostor_scores)

    fpr, tpr, thresholds = roc_curve(labels, scores)
    roc_auc = auc(fpr, tpr)
    eer, eer_threshold = compute_eer(fpr, tpr, thresholds)

    print(f"\n── ROC Results ──────────────────────────────")
    print(f"  AUC:            {roc_auc:.4f}")
    print(f"  EER:            {eer:.4f}  ({eer * 100:.2f}%)")
    print(f"  EER threshold:  {eer_threshold:.4f}")

    # Operating point analysis
    recommended = args.recommended_threshold
    rec_idx = np.searchsorted(thresholds[::-1], recommended, side='right')
    rec_idx = len(thresholds) - 1 - rec_idx
    rec_idx = np.clip(rec_idx, 0, len(thresholds) - 1)

    # Find closest threshold index
    closest_idx = np.argmin(np.abs(thresholds - recommended))
    rec_fpr = float(fpr[closest_idx])
    rec_tpr = float(tpr[closest_idx])
    rec_fnr = 1.0 - rec_tpr
    rec_precision = rec_tpr / (rec_tpr + rec_fpr + 1e-10)

    print(f"\n── Recommended Threshold: {recommended} ──────────")
    print(f"  TPR (Sensitivity): {rec_tpr:.4f}  ({rec_tpr*100:.2f}%)")
    print(f"  FPR:               {rec_fpr:.4f}  ({rec_fpr*100:.2f}%)")
    print(f"  FNR:               {rec_fnr:.4f}  ({rec_fnr*100:.2f}%)")

    # Confusion matrix at recommended threshold
    preds = (scores >= recommended).astype(int)
    cm = confusion_matrix(labels, preds)
    tn, fp, fn, tp = cm.ravel()
    print(f"\n── Confusion Matrix @ {recommended} ──────────────")
    print(f"  TP={tp}  FP={fp}")
    print(f"  FN={fn}  TN={tn}")

    # Plot
    plot_roc(fpr, tpr, roc_auc, eer, eer_threshold, recommended, output_dir)

    # Save JSON report
    report = {
        "model_path": str(args.model_path),
        "val_dir": str(args.val_dir),
        "num_identities": len(identity_names),
        "num_genuine_pairs": len(genuine_scores),
        "num_impostor_pairs": len(impostor_scores),
        "roc_auc": round(roc_auc, 6),
        "eer": round(eer, 6),
        "eer_threshold": round(eer_threshold, 4),
        "recommended_threshold": recommended,
        "at_recommended_threshold": {
            "tpr": round(rec_tpr, 4),
            "fpr": round(rec_fpr, 4),
            "fnr": round(rec_fnr, 4),
            "tp": int(tp), "fp": int(fp),
            "fn": int(fn), "tn": int(tn),
        },
        "spec_target": {
            "similarity_threshold": 0.68,
            "admin_range": "0.60–0.80",
            "note": "EER threshold is theoretical optimum; 0.68 balances security vs. UX for field deployment"
        }
    }

    report_path = output_dir / 'threshold_report.json'
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\n✅ Report saved: {report_path}")

    # Final recommendation
    print("\n── Deployment Recommendation ─────────────────")
    if eer_threshold < 0.60:
        print(f"  ⚠️  EER threshold {eer_threshold:.3f} < 0.60 — model may need more training.")
    elif eer_threshold > 0.80:
        print(f"  ⚠️  EER threshold {eer_threshold:.3f} > 0.80 — very conservative; may cause high FNR.")
    else:
        print(f"  ✅ EER threshold {eer_threshold:.3f} within admin range [0.60, 0.80].")
        print(f"  Using default threshold 0.68 (configurable in FaceShieldConfig).")

    print(f"\nCalibration complete. Results → {output_dir}/")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Calibrate cosine similarity threshold')
    parser.add_argument('--model_path', type=str, required=True,
                        help='INT8 TFLite model path')
    parser.add_argument('--val_dir', type=str, required=True,
                        help='Validation dataset directory (ImageFolder structure)')
    parser.add_argument('--output_dir', type=str, default='calibration_results')
    parser.add_argument('--recommended_threshold', type=float, default=0.68,
                        help='Operating point to evaluate (default: 0.68)')
    parser.add_argument('--max_pairs_per_identity', type=int, default=50,
                        help='Max genuine pairs per identity (default: 50)')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    np.random.seed(args.seed)
    calibrate(args)
