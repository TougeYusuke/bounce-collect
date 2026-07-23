import { describe, it, expect } from 'vitest';
import { Session } from '../src/core/session';
import { CONFIG } from '../src/core/config';
import { createFixedStage } from '../src/core/stage';

// 「終わるか」を見るテストは玉の上限を絞って軽く回す。
// 本番の2000個で2万フレーム回すと数分かかり、テストとして使い物にならない。
const SMALL = { maxBalls: 120, initialBalls: 3 };
const small = () => new Session(createFixedStage(), SMALL);

describe('Session', () => {
  it('開始直後はスコア0で、まだ終わっていない', () => {
    const s = new Session();
    expect(s.score).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('供給が進むと玉が盤面に出る', () => {
    const s = new Session();
    for (let i = 0; i < 60; i++) s.update(1);
    expect(s.pool.activeCount).toBeGreaterThan(0);
  });

  it('供給される総数は INITIAL_BALLS ぶん', () => {
    const s = new Session();
    for (let i = 0; i < 600; i++) s.update(1);
    expect(s.supplied).toBe(CONFIG.INITIAL_BALLS);
  });

  it('回収ラインを越えた玉はスコアになって消える', () => {
    const s = new Session();
    const b = s.pool.spawn(180, s.stage.collectY - 1, { weight: 25 })!;
    b.y = s.stage.collectY + 5;
    s.collect();
    expect(s.score).toBe(25);
    expect(b.alive).toBe(false);
  });

  it('落とすと玉が増える（ゲートが実際に効いている）', () => {
    const s = small();
    let peak = 0;
    for (let i = 0; i < 900; i++) {
      s.update(1);
      peak = Math.max(peak, s.pool.activeCount);
    }
    expect(peak).toBeGreaterThan(SMALL.initialBalls);
  });

  it('放っておけば必ず終わる（ジャンプ台の上限が効いている）', () => {
    const s = small();
    let frames = 0;
    while (!s.finished && frames < 6000) {
      s.update(1);
      frames++;
    }
    expect(s.finished).toBe(true);
  });

  it('終わった時点でスコアは初期玉数より多い（増殖が起きている）', () => {
    const s = small();
    let frames = 0;
    while (!s.finished && frames < 6000) s.update(1), frames++;
    expect(s.score).toBeGreaterThan(SMALL.initialBalls);
  });

  it('コップの位置は盤面の内側に収まる', () => {
    const s = new Session();
    s.setCupX(-999);
    expect(s.cupX).toBeGreaterThanOrEqual(0);
    s.setCupX(99999);
    expect(s.cupX).toBeLessThanOrEqual(CONFIG.BOARD_WIDTH);
  });

  it('コップの位置を変えると玉の落ちる場所が変わる', () => {
    const left = new Session();
    left.setCupX(60);
    for (let i = 0; i < 20; i++) left.update(1);
    const right = new Session();
    right.setCupX(300);
    for (let i = 0; i < 20; i++) right.update(1);

    const lx = left.pool.balls.find((b) => b.alive)!.x;
    const rx = right.pool.balls.find((b) => b.alive)!.x;
    expect(rx).toBeGreaterThan(lx);
  });

  it('速度を上げても成立する（早送りであって別ゲームではない）', () => {
    const run = (speed: number) => {
      const s = small();
      let frames = 0;
      while (!s.finished && frames < 6000) s.update(speed), frames++;
      return { score: s.score, finished: s.finished };
    };
    const a = run(1);
    const b = run(4);
    expect(a.finished).toBe(true);
    expect(b.finished).toBe(true);
    expect(a.score).toBeGreaterThan(0);
    expect(b.score).toBeGreaterThan(0);
  });
});
