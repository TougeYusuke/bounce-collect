import { describe, it, expect } from 'vitest';
import { applyJumpers } from '../src/core/jumpers';
import { BallPool } from '../src/core/ball';
import type { Stage } from '../src/core/stage';

const stage: Stage = {
  segments: [],
  gates: [],
  jumpers: [{ id: 0, x1: 100, x2: 200, y: 400, power: 9 }],
  collectY: 700,
};

function fallingBall(pool: BallPool, x = 150, bounce = 0) {
  const b = pool.spawn(x, 405, { bounce })!;
  b.py = 395; // 上から下へまたいだ
  b.px = x;
  return b;
}

describe('applyJumpers', () => {
  it('触れた玉は上向きの速度をもらう', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    applyJumpers(pool, stage, 5);
    expect(b.y - b.py).toBeLessThan(0); // 上向き
  });

  it('使うたびに bounce が増える', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    applyJumpers(pool, stage, 5);
    expect(b.bounce).toBe(1);
  });

  it('上限に達した玉は素通りする（速度をもらわない）', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool, 150, 5);
    const before = b.y - b.py;
    applyJumpers(pool, stage, 5);
    expect(b.bounce).toBe(5); // 増えない
    expect(b.y - b.py).toBeCloseTo(before);
  });

  it('x が範囲外なら反応しない', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool, 50);
    applyJumpers(pool, stage, 5);
    expect(b.bounce).toBe(0);
  });

  it('眠っている玉は起きて打ち上がる', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    b.sleeping = true;
    applyJumpers(pool, stage, 5);
    expect(b.sleeping).toBe(false);
    expect(b.bounce).toBe(1);
  });

  it('下から上へ通り抜ける時は反応しない（打ち上げ直後に再点火しない）', () => {
    const pool = new BallPool(10);
    const b = pool.spawn(150, 395)!;
    b.py = 405; // 下から上へ
    b.px = 150;
    applyJumpers(pool, stage, 5);
    expect(b.bounce).toBe(0);
  });

  it('1フレームで2つの台に反応しない', () => {
    const twoJumpers: Stage = {
      ...stage,
      jumpers: [
        { id: 0, x1: 100, x2: 200, y: 400, power: 9 },
        { id: 1, x1: 100, x2: 200, y: 402, power: 9 },
      ],
    };
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    applyJumpers(pool, twoJumpers, 5);
    expect(b.bounce).toBe(1);
  });

  it('同じ台には1回しか反応しない（2回目以降は素通り）', () => {
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    for (let i = 0; i < 50; i++) {
      b.y = 405;
      b.py = 395;
      applyJumpers(pool, stage, 99);
    }
    expect(b.bounce).toBe(1); // 何度落ちてきても1回だけ
    expect(b.jumperMask).toBe(1);
  });

  it('別の台なら反応する（台ごとに1回ずつ）', () => {
    const two = {
      ...stage,
      jumpers: [
        { id: 0, x1: 100, x2: 200, y: 400, power: 9 },
        { id: 1, x1: 100, x2: 200, y: 600, power: 9 },
      ],
    };
    const pool = new BallPool(10);
    const b = fallingBall(pool);
    applyJumpers(pool, two, 99);
    expect(b.bounce).toBe(1);
    b.y = 605;
    b.py = 595;
    applyJumpers(pool, two, 99);
    expect(b.bounce).toBe(2);
    expect(b.jumperMask).toBe(0b11);
  });

  it('跳ね回数の上限に達したら、未使用の台でも素通りする', () => {
    const two = {
      ...stage,
      jumpers: [
        { id: 0, x1: 100, x2: 200, y: 400, power: 9 },
        { id: 1, x1: 100, x2: 200, y: 600, power: 9 },
      ],
    };
    const pool = new BallPool(10);
    const b = fallingBall(pool, 150, 5); // すでに上限
    applyJumpers(pool, two, 5);
    expect(b.bounce).toBe(5);
    expect(b.jumperMask).toBe(0);
  });
});
