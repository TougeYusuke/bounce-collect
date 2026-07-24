import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { DEFAULT_STAGE_DEF, buildStage, type StageDef } from '../src/core/stageDef';

const tiny: StageDef = {
  name: 'tiny',
  gates: [
    { x1: 10, x2: 100, y: 200, multiplier: 3 },
    { x1: 120, x2: 200, y: 300, multiplier: 4 },
  ],
  jumpers: [{ x1: 20, x2: 90, y: 500 }],
  dividers: [{ x1: 180, y1: 250, x2: 180, y2: 320 }],
};

describe('StageDef → Stage', () => {
  it('id は配列の並び順で振られる（JSONに書かせない）', () => {
    const s = buildStage(tiny);
    expect(s.gates.map((g) => g.id)).toEqual([0, 1]);
    expect(s.jumpers.map((j) => j.id)).toEqual([0]);
  });

  it('位置と倍率はそのまま移る', () => {
    const s = buildStage(tiny);
    expect(s.gates[0]).toMatchObject({ x1: 10, x2: 100, y: 200, multiplier: 3 });
    expect(s.jumpers[0]).toMatchObject({ x1: 20, x2: 90, y: 500 });
  });

  it('ジャンプ台の力は共通設定から入る（ステージごとに変えない）', () => {
    const s = buildStage(tiny);
    expect(s.jumpers[0].power).toBe(CONFIG.JUMP_POWER);
  });

  it('V字漏斗・回収ライン・アジテータは自動で足される（StageDefには持たせない）', () => {
    const s = buildStage(tiny);
    expect(s.wedges?.length).toBe(2);
    expect(s.collectY).toBeGreaterThan(0);
    expect(s.agitate).toBeDefined();
  });

  it('⚠️ 漏斗は当たり判定の線分としても登録される（片方だけだと抜ける）', () => {
    const s = buildStage(tiny);
    for (const w of s.wedges ?? []) {
      expect(s.segments).toContain(w);
    }
  });

  it('仕切りも線分として入る', () => {
    const s = buildStage(tiny);
    expect(s.segments.some((seg) => seg.x1 === 180 && seg.y1 === 250)).toBe(true);
  });

  it('毎回新しいオブジェクトを返す（使い回すと前の回の状態が残る）', () => {
    const a = buildStage(tiny);
    const b = buildStage(tiny);
    expect(a.gates).not.toBe(b.gates);
    expect(a.gates[0]).not.toBe(b.gates[0]);
  });

  it('既定ステージも同じ道で組める', () => {
    const s = buildStage(DEFAULT_STAGE_DEF);
    expect(s.gates.length).toBeGreaterThan(0);
    expect(s.jumpers.length).toBeGreaterThan(0);
    expect(s.wedges?.length).toBe(2);
  });

  it('⚠️ ゲート・ジャンプ台は32個を超えられない（マスクが32bitのため）', () => {
    const many: StageDef = {
      name: 'over',
      gates: Array.from({ length: 33 }, (_, i) => ({ x1: 0, x2: 10, y: i, multiplier: 2 })),
      jumpers: [],
      dividers: [],
    };
    expect(() => buildStage(many)).toThrow();
  });
});
