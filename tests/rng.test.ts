import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng';

describe('createRng', () => {
  it('同じシードなら同じ数列を返す', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it('違うシードなら違う数列を返す', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('必ず 0 以上 1 未満を返す', () => {
    const r = createRng(999);
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
