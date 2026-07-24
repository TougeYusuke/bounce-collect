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
  }, 60_000);

  it('R2はタップを待たずシームレスに始まる', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.round === 2);
    expect(m.session.started).toBe(true);
  }, 60_000);

  it('R1が終わると下バケツが下へ抜ける演出を挟む', () => {
    const m = new Match();
    m.start();
    runUntil(m, (x) => x.transitioning);
    expect(m.transitioning).toBe(true);
    expect(m.round).toBe(1); // 演出中はまだR1扱い（下バケツを描くため）
    expect(m.session.started).toBe(false); // 盤面はまだ動かさない

    // 演出が明けるとR2が動き出す
    runUntil(m, (x) => !x.transitioning);
    expect(m.round).toBe(2);
    expect(m.session.started).toBe(true);
  }, 60_000);

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
