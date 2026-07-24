import { describe, expect, it } from 'vitest';
import { MATERIALS, pickMaterial } from '../src/render/theme';

describe('素材テーマ', () => {
  it('6種類ある', () => {
    expect(MATERIALS).toHaveLength(6);
  });

  it('キーが重複していない', () => {
    const keys = MATERIALS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('抽選は必ず定義済みのテーマを返す', () => {
    for (let i = 0; i < 100; i++) {
      const m = pickMaterial(() => i / 100);
      expect(MATERIALS).toContain(m);
    }
  });

  it('乱数が1.0を返しても範囲外にならない', () => {
    expect(pickMaterial(() => 1)).toBe(MATERIALS[MATERIALS.length - 1]);
  });
});
