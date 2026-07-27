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
    // ⚠️ `fixed: true` を付けてあるのは**位置抽選を止めて、どの台が選ばれたかを y で見るため**
    //    （2026-07-27 に位置抽選が入り、固定しない台は y が動くようになった）。
    //    期待値を緩めたのではなく、測り方を仕様に合わせた。
    const many: StageDef = {
      ...def(),
      jumpers: [
        { x1: 10, x2: 100, y: 300, fixed: true },
        { x1: 10, x2: 100, y: 560, fixed: true }, // これが最下段
        { x1: 200, x2: 300, y: 480, fixed: true },
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

/**
 * 固定するか毎回抽選するかを型ごとに選べる（2026-07-27 れいあ要望）。
 * ⚠️ 既存の型は `fixed` を持たないので、これまでどおり**全部抽選**になること（後方互換）。
 */
describe('固定と抽選の切り替え', () => {
  it('倍率を固定したゲートは、種を変えても値が動かない', () => {
    const d: StageDef = {
      ...def(),
      gates: [
        { x1: 0, x2: 180, y: 300, multiplier: 10, fixed: true },
        { x1: 180, x2: 360, y: 300, multiplier: 2 }, // 固定しない＝抽選
      ],
    };
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const g = rollStage(d, createRng(seed)).gates;
      expect(g[0].multiplier).toBe(10); // 固定したものは動かない
      seen.add(g[1].multiplier);
    }
    expect(seen.size).toBeGreaterThan(1); // 固定していないものは動く
  });

  it('⚠️ fixed を持たない既存の型は、これまでどおり全部抽選される', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      for (const g of rollStage(def(), createRng(seed)).gates) seen.add(g.multiplier);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('位置を固定したジャンプ台は、種を変えても動かない', () => {
    const d: StageDef = { ...def(), jumpers: [{ x1: 0, x2: 80, y: 520, fixed: true }] };
    for (let seed = 1; seed <= 20; seed++) {
      const j = rollStage(d, createRng(seed)).jumpers[0];
      expect([j.x1, j.x2, j.y]).toEqual([0, 80, 520]);
    }
  });

  it('位置を固定しないジャンプ台は、幅を保ったまま場所が抽選される', () => {
    const d: StageDef = { ...def(), jumpers: [{ x1: 0, x2: 80, y: 520 }] };
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const j = rollStage(d, createRng(seed)).jumpers[0];
      expect(j.x2 - j.x1).toBe(80); // 幅は変えない（当たりの広さが変わってしまう）
      expect(j.x1).toBeGreaterThanOrEqual(0);
      expect(j.x2).toBeLessThanOrEqual(CONFIG.BOARD_WIDTH);
      // ⚠️ 帯の中に収まること（上に出ると増殖ループが早く終わる）
      expect(j.y).toBeGreaterThanOrEqual(CONFIG.JUMPER_ZONE_TOP);
      expect(j.y).toBeLessThanOrEqual(CONFIG.JUMPER_ZONE_BOTTOM);
      xs.add(j.x1);
      ys.add(j.y);
    }
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it('抽選した位置も5px刻みに乗る（手で置いた時と同じ見た目にする）', () => {
    const d: StageDef = { ...def(), jumpers: [{ x1: 0, x2: 80, y: 520 }] };
    for (let seed = 1; seed <= 20; seed++) {
      const j = rollStage(d, createRng(seed)).jumpers[0];
      expect(j.x1 % CONFIG.EDITOR_GRID).toBe(0);
      expect(j.y % CONFIG.EDITOR_GRID).toBe(0);
    }
  });

  it('同じ種なら位置も同じ（「さっきのをもう一度」が作れる）', () => {
    const d: StageDef = { ...def(), jumpers: [{ x1: 0, x2: 80, y: 520 }] };
    expect(rollStage(d, createRng(7))).toEqual(rollStage(d, createRng(7)));
  });
});
