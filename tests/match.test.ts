import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Match } from '../src/core/match';

/** 条件を満たすか、十分な時間が経つまで回す */
function runUntil(m: Match, cond: (m: Match) => boolean): void {
  for (let i = 0; i < CONFIG.ROUND_TIME_LIMIT * 3 && !cond(m); i++) m.update(1);
}

describe('Match（2ラウンド）', () => {
  it('R1から始まる', () => {
    const m = new Match();
    expect(m.round).toBe(1);
    expect(m.session.mode).toBe('r1');
  });

  it('R1が終わるとR2が始まり、R1の回収数が供給量になる', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.round === 2);

    expect(m.round).toBe(2);
    expect(m.r1Score).toBeGreaterThan(0);
    expect(m.session.mode).toBe('r2');
    // 切り上げのぶん、供給の合計はR1の結果以上になる
    expect(m.session.supplyBalls * m.session.supplyWeight).toBeGreaterThanOrEqual(m.r1Score);
  });

  it('R2はタップを待たずシームレスに始まる', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.round === 2);
    expect(m.session.started).toBe(true);
  });

  it('R2のゲートは使用量0から始まる（capacityがリセットされる）', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.round === 2);
    expect(m.session.stage.gates.every((g) => g.used === 0)).toBe(true);
  });

  // 2ラウンド通しは玉が1000個規模で数千フレーム回るため、既定の5秒では足りない
  it('最終スコアはR2の回収（R1は足さない）', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.finished);

    expect(m.finished).toBe(true);
    expect(m.finalScore).toBe(m.session.score);
    // ⚠️ R1の結果を足していないこと（足すと供給として使ったぶんの二重計上になる）
    expect(m.finalScore).not.toBe(m.r1Score + m.session.score);
  }, 60_000);
});
