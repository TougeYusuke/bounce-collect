import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { DEFAULT_STAGE_DEF, type StageDef } from '../src/core/stageDef';
import { rollStage } from '../src/core/stageRoll';

function def(): StageDef {
  return structuredClone(DEFAULT_STAGE_DEF);
}

describe('中身の抽選', () => {
  it('位置は変えない（配置はエディタで作るもの）', () => {
    const before = def();
    const after = rollStage(before, createRng(1));
    expect(after.gates.map((g) => [g.x1, g.x2, g.y])).toEqual(
      before.gates.map((g) => [g.x1, g.x2, g.y]),
    );
    expect(after.dividers).toEqual(before.dividers);
  });

  it('倍率は候補の中から選ばれる', () => {
    const values = new Set<number>(CONFIG.GATE_MULTIPLIER_TABLE.map((e) => e.value));
    for (let seed = 1; seed <= 50; seed++) {
      for (const g of rollStage(def(), createRng(seed)).gates) {
        expect(values.has(g.multiplier)).toBe(true);
      }
    }
  });

  it('⚠️ ジャンプ台は最下段の1台だけになる（複数だとラウンドが終わらない）', () => {
    const many: StageDef = {
      ...def(),
      jumpers: [
        { x1: 10, x2: 100, y: 300 },
        { x1: 10, x2: 100, y: 560 }, // これが最下段
        { x1: 200, x2: 300, y: 480 },
      ],
    };
    const rolled = rollStage(many, createRng(7));
    expect(rolled.jumpers).toHaveLength(1);
    expect(rolled.jumpers[0].y).toBe(560);
  });

  it('跳ね上限は設定した範囲に収まる', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const j = rollStage(def(), createRng(seed)).jumpers[0];
      expect(j.capacity).toBeGreaterThanOrEqual(CONFIG.JUMPER_CAPACITY_MIN);
      expect(j.capacity).toBeLessThanOrEqual(CONFIG.JUMPER_CAPACITY_MAX);
    }
  });

  it('ジャンプ台が無いステージでも落ちない', () => {
    const none: StageDef = { ...def(), jumpers: [] };
    expect(rollStage(none, createRng(3)).jumpers).toEqual([]);
  });

  it('⚠️ 元のデータを書き換えない（保存してある型を抽選が汚さない）', () => {
    const original = def();
    const copy = structuredClone(original);
    rollStage(original, createRng(9));
    expect(original).toEqual(copy);
  });

  it('同じ種なら同じ中身になる（「さっきのをもう一度」が作れる）', () => {
    expect(rollStage(def(), createRng(42))).toEqual(rollStage(def(), createRng(42)));
  });

  it('種が違えば中身も変わる', () => {
    const a = rollStage(def(), createRng(1)).gates.map((g) => g.multiplier);
    const b = rollStage(def(), createRng(2)).gates.map((g) => g.multiplier);
    expect(a).not.toEqual(b);
  });
});
