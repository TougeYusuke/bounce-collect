/**
 * mulberry32: 32bit シード付き擬似乱数。同じシードなら必ず同じ数列を返す。
 *
 * Math.random() を使わない理由:
 *   - 同じ配置を再現できないとバグを追えない
 *   - 「さっきの神配置をもう一度」が作れない
 *   - テストが書けない
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 範囲 [min, max) の実数を返す */
export function rangeFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 範囲 [min, max] の整数を返す */
export function rangeInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}
