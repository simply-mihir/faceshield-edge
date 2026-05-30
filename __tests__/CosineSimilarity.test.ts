/**
 * Unit tests — CosineSimilarity
 * Tests identity matching logic without any native modules.
 */
import {CosineSimilarity} from '../src/utils/CosineSimilarity';

describe('CosineSimilarity', () => {
  // Helpers
  const makeEmbedding = (size = 128, seed = 1): number[] => {
    const v = Array.from({length: size}, (_, i) => Math.sin(i * seed));
    return CosineSimilarity.l2Normalize(v);
  };

  describe('compute', () => {
    it('returns 1.0 for identical embeddings', () => {
      const e = makeEmbedding(128, 1);
      expect(CosineSimilarity.compute(e, e)).toBeCloseTo(1.0, 5);
    });

    it('returns value in [-1, 1]', () => {
      const a = makeEmbedding(128, 1);
      const b = makeEmbedding(128, 2);
      const sim = CosineSimilarity.compute(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('is commutative: sim(a,b) === sim(b,a)', () => {
      const a = makeEmbedding(128, 3);
      const b = makeEmbedding(128, 7);
      expect(CosineSimilarity.compute(a, b)).toBeCloseTo(
        CosineSimilarity.compute(b, a),
        10,
      );
    });

    it('throws on dimension mismatch', () => {
      expect(() =>
        CosineSimilarity.compute(makeEmbedding(128), makeEmbedding(64)),
      ).toThrow('Embedding dimension mismatch');
    });
  });

  describe('matchAgainstSet', () => {
    it('returns highest similarity from a set', () => {
      const query = makeEmbedding(128, 1);
      const stored = [
        makeEmbedding(128, 2),
        makeEmbedding(128, 1), // exact match
        makeEmbedding(128, 5),
      ];
      expect(CosineSimilarity.matchAgainstSet(query, stored)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for empty set', () => {
      expect(CosineSimilarity.matchAgainstSet(makeEmbedding(), [])).toBe(0);
    });

    it('threshold 0.68: same identity passes, different fails', () => {
      const alice = makeEmbedding(128, 42);
      const aliceVariant = CosineSimilarity.l2Normalize(
        alice.map((v, i) => v + 0.01 * Math.cos(i)), // slight variation
      );
      const bob = makeEmbedding(128, 99);

      const simAlice = CosineSimilarity.matchAgainstSet(aliceVariant, [alice]);
      const simBob   = CosineSimilarity.matchAgainstSet(bob,          [alice]);

      expect(simAlice).toBeGreaterThan(0.68);  // same person → authenticate
      expect(simBob).toBeLessThan(0.68);       // different person → reject
    });
  });

  describe('l2Normalize', () => {
    it('produces a unit vector', () => {
      const v = [3, 4, 0]; // norm = 5
      const n = CosineSimilarity.l2Normalize(v);
      const norm = Math.sqrt(n.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1.0, 10);
    });

    it('handles zero vector without NaN', () => {
      const v = [0, 0, 0];
      const n = CosineSimilarity.l2Normalize(v);
      n.forEach(x => expect(isNaN(x)).toBe(false));
    });
  });
});
