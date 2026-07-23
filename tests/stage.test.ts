import { describe, it, expect } from 'vitest';
import { createFixedStage } from '../src/core/stage';
import { CONFIG } from '../src/core/config';

describe('createFixedStage', () => {
  const stage = createFixedStage();

  it('ゲートIDが 0 から連番で、32個を超えない', () => {
    const ids = stage.gates.map((g) => g.id);
    expect(ids).toEqual(ids.map((_, i) => i));
    expect(ids.length).toBeLessThanOrEqual(32); // gateMask が32bitのため
  });

  it('ゲートの倍率はすべて2以上', () => {
    for (const g of stage.gates) expect(g.multiplier).toBeGreaterThanOrEqual(2);
  });

  it('ゲートもジャンプ台も盤面の中に収まっている', () => {
    for (const g of [...stage.gates, ...stage.jumpers]) {
      expect(g.x1).toBeGreaterThanOrEqual(0);
      expect(g.x2).toBeLessThanOrEqual(CONFIG.BOARD_WIDTH);
      expect(g.x1).toBeLessThan(g.x2);
      expect(g.y).toBeGreaterThan(0);
      expect(g.y).toBeLessThan(CONFIG.BOARD_HEIGHT);
    }
  });

  it('ジャンプ台はゲートより下にある（上に打ち返してゲートを再走させるため）', () => {
    const lowestGate = Math.max(...stage.gates.map((g) => g.y));
    for (const j of stage.jumpers) expect(j.y).toBeGreaterThan(lowestGate - 1);
  });

  it('V字傾斜と回収ラインを持つ', () => {
    expect(stage.segments.length).toBeGreaterThan(0);
    expect(stage.collectY).toBeGreaterThan(0);
    expect(stage.collectY).toBeLessThanOrEqual(CONFIG.BOARD_HEIGHT);
  });

  it('回収ラインはジャンプ台より下にある', () => {
    for (const j of stage.jumpers) expect(stage.collectY).toBeGreaterThan(j.y);
  });

  it('V字の中央が閉じていない（閉じると玉が回収されず永久に終わらない）', () => {
    const h = CONFIG.BOARD_HEIGHT;
    // 最下部の傾斜どうしの内側の端に隙間があること
    const lower = stage.segments.filter((s) => s.y2 > h - 120 || s.y1 > h - 120);
    expect(lower.length).toBeGreaterThanOrEqual(2);
    const innerEnds = lower.map((s) => (s.x1 < s.x2 ? s.x2 : s.x1)).sort((a, b) => a - b);
    expect(innerEnds[innerEnds.length - 1] - innerEnds[0]).toBeGreaterThan(
      CONFIG.BALL_RADIUS * 2,
    );
  });
});
