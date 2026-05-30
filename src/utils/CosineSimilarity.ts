/**
 * CosineSimilarity — Identity matching engine
 *
 * Compares a query embedding against a set of stored embeddings.
 * Returns the MAX similarity across all stored embeddings for an employee
 * (handles 5-embedding-per-person enrollment).
 *
 * Threshold: 0.68 (admin configurable)
 * All embeddings are L2-normalised so: cosine_sim = dot_product
 */
export class CosineSimilarity {
  /**
   * cosine_similarity(a, b) = (a · b) / (|a| × |b|)
   * Since embeddings are L2-normalised, this reduces to a · b
   */
  static compute(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    // Clamp to [-1, 1] for numerical safety
    return Math.max(-1, Math.min(1, dot));
  }

  /**
   * Match query against multiple stored embeddings.
   * Returns highest similarity score (best match).
   * For enrolled employees with 5 images this picks the pose that
   * best matches the current frame.
   */
  static matchAgainstSet(query: number[], storedSet: number[][]): number {
    if (!storedSet || storedSet.length === 0) return 0;
    return Math.max(...storedSet.map(stored => this.compute(query, stored)));
  }

  /**
   * L2-normalise an embedding vector in place (utility for raw model output).
   */
  static l2Normalize(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return embedding;
    return embedding.map(v => v / norm);
  }
}
