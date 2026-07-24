import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Session } from '../src/core/session';
import { createFixedStage } from '../src/core/stage';

/** 指定フレーム進める小道具 */
function run(s: Session, frames: number): void {
  for (let i = 0; i < frames; i++) s.update(1);
}

describe('R2モードの供給', () => {
  it('mode を省くと R1（既定）', () => {
    expect(new Session().mode).toBe('r1');
  });

  it('R2は supplyTotal を weight にまとめて配る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    // 配る玉数は上限で頭打ち、weight は切り上げ
    expect(s.supplyBalls).toBe(CONFIG.R2_SUPPLY_BALLS);
    expect(s.supplyWeight).toBe(Math.ceil(10_000 / CONFIG.R2_SUPPLY_BALLS));
    // 供給の合計は元の数以上（切り上げのぶん上回る）
    expect(s.supplyBalls * s.supplyWeight).toBeGreaterThanOrEqual(10_000);
  });

  it('供給量が上限より小さいときは weight 1 でその数だけ配る', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 30 });
    expect(s.supplyBalls).toBe(30);
    expect(s.supplyWeight).toBe(1);
  });

  it('R2で出てくる玉は weight を持っている', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    run(s, 40);
    let seen = 0;
    s.pool.forEachActive((b) => {
      if (b.weight >= s.supplyWeight) seen++;
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('R2は1回に複数個を横に並べて出す（縦の間隔は詰められないため）', () => {
    const s = new Session(createFixedStage(), { mode: 'r2', supplyTotal: 10_000 });
    s.start();
    // supplyTimer は「開始直後に出す」初期値なので、1フレームでちょうど1回ぶん出る
    run(s, 1);
    expect(s.supplied).toBe(CONFIG.R2_SUPPLY_PER_TICK);

    // 同じ高さに並んでいて、横は最低でも直径ぶん離れている
    const xs: number[] = [];
    s.pool.forEachActive((b) => xs.push(b.x));
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CONFIG.BALL_RADIUS * 2);
    }
  });

  it('R1の供給は1個ずつのまま（既存の挙動を変えない）', () => {
    const s = new Session();
    s.start();
    run(s, 1);
    expect(s.supplied).toBe(1);
  });
});
