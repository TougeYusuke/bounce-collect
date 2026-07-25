import { describe, it, expect } from 'vitest';
import { BallPool } from '../src/core/ball';
import { SpatialGrid } from '../src/core/grid';
import { step, updateSpin } from '../src/core/solver';
import { applyGates } from '../src/core/gates';
import type { Stage } from '../src/core/stage';
import type { World } from '../src/core/world';
import { spinIndex, spinSteps, spinsVisibly, SPIN_STEPS } from '../src/render/ballArt';
import { findBallSkin } from '../src/render/theme';
import { CONFIG } from '../src/core/config';

/**
 * 玉の回転（2026-07-25 れいあ要望「丸だったら気が付かなかったけど、星とかだと動かないのは違和感」）。
 *
 * 🔑 角度は**物理から作る**（乱数を使わない）。転がりの見立てで `spin += vx / radius`。
 * ⚠️ 当たり判定は円のまま＝回しても物理は変わらない。
 */

describe('updateSpin（転がりの見立て）', () => {
  it('右へ進む玉は角度が増える', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    b.px = 45; // 右向きに5進んだ
    updateSpin(b, 5);
    expect(b.spin).toBeCloseTo(1); // 5 / 半径5 = 1ラジアン
  });

  it('左へ進む玉は角度が減る', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    b.px = 55; // 左向きに5進んだ
    updateSpin(b, 5);
    expect(b.spin).toBeCloseTo(-1);
  });

  it('横に動いていない玉は回らない', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    b.py = 30; // 縦にだけ動いている
    updateSpin(b, 5);
    expect(b.spin).toBe(0);
  });

  it('円周ぶん進むとちょうど1周する', () => {
    const pool = new BallPool(1);
    const r = 5;
    const b = pool.spawn(0, 0)!;
    // 1周ぶんの距離（2πr）を10回に分けて進む
    const dx = (2 * Math.PI * r) / 10;
    for (let i = 0; i < 10; i++) {
      b.px = b.x;
      b.x += dx;
      updateSpin(b, r);
    }
    expect(b.spin).toBeCloseTo(Math.PI * 2);
  });
});

describe('step の中で回る', () => {
  const opts = {
    gravity: 0,
    damping: 1,
    radius: 5,
    maxSpeed: 99,
    restitution: 0,
    iterations: 1,
    sleepVelocity: 0.1,
    sleepFrames: 0,
  };

  const world: World = { width: 360, height: 720, segments: [] };

  it('横へ動いている玉は step を回すと角度が変わる', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(360, 720, 20);
    const b = pool.spawn(100, 100)!;
    b.px = 95; // 右向きに速度5
    step(pool, grid, world, opts);
    expect(b.spin).toBeGreaterThan(0);
  });

  it('眠っている玉は回らない', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(360, 720, 20);
    const b = pool.spawn(100, 100)!;
    b.px = 95;
    b.sleeping = true;
    step(pool, grid, world, opts);
    expect(b.spin).toBe(0);
  });
});

describe('spawn の角度', () => {
  it('既定は 0 から始まる', () => {
    const pool = new BallPool(2);
    expect(pool.spawn(10, 10)!.spin).toBe(0);
  });

  it('指定した角度で生まれる', () => {
    const pool = new BallPool(2);
    expect(pool.spawn(10, 10, { spin: 1.25 })!.spin).toBeCloseTo(1.25);
  });

  it('使い回した枠でも前の玉の角度が残らない', () => {
    const pool = new BallPool(1);
    const a = pool.spawn(10, 10, { spin: 2 })!;
    pool.kill(a);
    expect(pool.spawn(10, 10)!.spin).toBe(0);
  });
});

describe('ゲートで生まれた子', () => {
  /** ゲート1本だけの盤面 */
  const stage = (): Stage => ({
    gates: [{ id: 0, x1: 0, x2: 360, y: 100, multiplier: 2 }],
    jumpers: [],
    segments: [],
    collectY: 700,
  } as unknown as Stage);

  it('親の回転角を継承する（分身が一斉に0度から始まらない）', () => {
    const pool = new BallPool(8);
    const b = pool.spawn(180, 105)!;
    b.px = 180;
    b.py = 95; // ゲート(y=100)を上から下へまたいだ
    b.spin = 1.75;
    applyGates(pool, stage(), 100, 10);
    const children = pool.balls.filter((c) => c.alive && c !== b);
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) expect(c.spin).toBeCloseTo(1.75);
  });
});

describe('焼く角度の枚数', () => {
  it('円で模様なしの玉は回さない（1枚だけ焼く）', () => {
    const plain = findBallSkin('plain');
    expect(spinsVisibly(plain)).toBe(false);
    expect(spinSteps(plain)).toBe(1);
  });

  it('星は角度ぶん焼く', () => {
    const star = findBallSkin('star');
    expect(spinsVisibly(star)).toBe(true);
    expect(spinSteps(star)).toBeGreaterThan(1);
  });

  it('野球ボールは円でも回す（縫い目が回るため）', () => {
    expect(spinsVisibly(findBallSkin('baseball'))).toBe(true);
  });

  it('金貨は同心円の模様なので回さない', () => {
    expect(spinsVisibly(findBallSkin('coin'))).toBe(false);
  });
});

describe('spinIndex', () => {
  it('0度は0枚目', () => {
    expect(spinIndex(0, 12)).toBe(0);
  });

  it('半周は真ん中の枚目', () => {
    expect(spinIndex(Math.PI, 12)).toBe(6);
  });

  it('1周すると0枚目に戻る', () => {
    expect(spinIndex(Math.PI * 2, 12)).toBe(0);
  });

  it('負の角度でも 0〜steps-1 に収まる', () => {
    for (const a of [-0.1, -Math.PI, -7.5, -100]) {
      const i = spinIndex(a, 12);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(12);
      expect(Number.isInteger(i)).toBe(true);
    }
  });

  it('回さない玉（steps=1）は常に0枚目', () => {
    expect(spinIndex(9.9, 1)).toBe(0);
  });
});

/**
 * 実測 2026-07-25（`tests/_measure.tmp.test.ts` で 21万サンプル）:
 * 1フレームの回転は中央値 3.2度・最大 46.4度（＝速度上限 6.4 ÷ 半径 8 の理論値どおり）。
 */
describe('回転の速さと焼く段数の釣り合い', () => {
  it('速度上限で回っても絵が逆回りに見えない（1フレームの回転が半周未満）', () => {
    // ⚠️ ここが壊れるのは **MAX_SPEED を上げた／BALL_RADIUS を小さくした**時。
    //    半周を超えると、絵は「少し戻った」ようにしか見えず回転が逆向きになる（ストロボ）
    const radPerFrame = CONFIG.MAX_SPEED / CONFIG.BALL_RADIUS;
    expect(radPerFrame).toBeLessThan(Math.PI);
  });

  it('よく出る速さで絵が切り替わる（回っていないように見えない）', () => {
    // ⚠️ ここが壊れるのは **SPIN_STEPS を減らした**時。
    //    実測の中央値 3.2度/フレームで、10フレーム以内に次の絵へ進むこと
    const degPerStep = 360 / SPIN_STEPS;
    expect(degPerStep / 3.2).toBeLessThan(10);
  });
});
