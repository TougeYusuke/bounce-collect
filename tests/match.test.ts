import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Match } from '../src/core/match';

/**
 * ⚠️ 種を固定する。Match は開始のたびに中身（倍率・跳ね上限）を抽選するので、
 *    渡さないと毎回違うゲームを測ることになりテストが揺れる。
 */
const SEED = 20260724;

/** 条件を満たすか、十分な時間が経つまで回す */
function runUntil(m: Match, cond: (m: Match) => boolean): void {
  for (let i = 0; i < CONFIG.ROUND_TIME_LIMIT * 3 && !cond(m); i++) m.update(1);
}

describe('Match（2ラウンド）', () => {
  it('R1から始まる', () => {
    const m = new Match(SEED);
    expect(m.round).toBe(1);
    expect(m.session.mode).toBe('r1');
  });

  it('R1が終わるとR2が始まり、R1の回収数が供給量になる', () => {
    const m = new Match(SEED);
    m.start();
    runUntil(m, (x) => x.round === 2);

    expect(m.round).toBe(2);
    expect(m.r1Score).toBeGreaterThan(0);
    expect(m.session.mode).toBe('r2');
    // ⚠️ **個数のまま**ぴったり引き継ぐ（重い玉にまとめない・2026-07-24）
    expect(m.session.supplyBalls).toBe(m.r1Score);
    // コップの残量表示も同じ値から始まる（個数ではなく中身）
    expect(m.session.remaining).toBe(m.r1Score);
  }, 60_000);

  it('⚠️ R2もタップを待つ（自動では落ち始めない）', () => {
    const m = new Match(SEED);
    m.start();
    runUntil(m, (x) => x.round === 2);
    // 演出が明けてR2になっても、タップするまでは玉が出ない
    expect(m.session.started).toBe(false);
    for (let i = 0; i < 120; i++) m.update(1);
    expect(m.session.supplied).toBe(0);
    // タップして初めて動き出す
    m.start();
    for (let i = 0; i < 30; i++) m.update(1);
    expect(m.session.supplied).toBeGreaterThan(0);
  }, 60_000);

  it('R1が終わると下バケツが下へ抜ける演出を挟む', () => {
    const m = new Match(SEED);
    m.start();
    runUntil(m, (x) => x.transitioning);
    expect(m.transitioning).toBe(true);
    expect(m.round).toBe(1); // 演出中はまだR1扱い（下バケツを描くため）
    expect(m.session.started).toBe(false); // 盤面はまだ動かさない

    // 演出が明けるとR2に入る（開始はタップ待ち）
    runUntil(m, (x) => !x.transitioning);
    expect(m.round).toBe(2);
    expect(m.session.started).toBe(false);
  }, 60_000);

  // 2ラウンド通しは玉が1000個規模で数千フレーム回るため、既定の5秒では足りない
  it('最終スコアはR2の回収（R1は足さない）', () => {
    const m = new Match(SEED);
    m.start();
    // R1が終わってR2に入ったら、プレイヤーがもう一度タップする想定
    runUntil(m, (x) => x.round === 2 && !x.transitioning);
    m.start();
    runUntil(m, (x) => x.finished);

    expect(m.finished).toBe(true);
    expect(m.finalScore).toBe(m.session.score);
    // ⚠️ R1の結果を足していないこと（足すと供給として使ったぶんの二重計上になる）
    expect(m.finalScore).not.toBe(m.r1Score + m.session.score);
  }, 60_000);
});
