import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { buildStage } from '../src/core/stageDef';
import { STAGES, pickStageDef } from '../src/core/stages';

describe('遊べる型', () => {
  it('⚠️ 保存が1つも無くても最低1つある（空だとゲームが始まらない）', () => {
    expect(STAGES.length).toBeGreaterThan(0);
  });

  it('どの型もそのまま組み立てられる', () => {
    for (const def of STAGES) {
      expect(() => buildStage(def)).not.toThrow();
    }
  });

  it('選ばれるのは必ずリストの中の型（配置は生成しない）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(STAGES).toContain(pickStageDef(createRng(seed)));
    }
  });

  it('同じ種なら同じ型が選ばれる', () => {
    expect(pickStageDef(createRng(5))).toBe(pickStageDef(createRng(5)));
  });
});
