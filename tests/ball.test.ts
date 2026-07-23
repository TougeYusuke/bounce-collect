import { describe, it, expect } from 'vitest';
import { BallPool } from '../src/core/ball';

describe('BallPool', () => {
  it('spawn した玉が activeCount に反映される', () => {
    const pool = new BallPool(10);
    expect(pool.activeCount).toBe(0);
    pool.spawn(100, 50);
    pool.spawn(120, 50);
    expect(pool.activeCount).toBe(2);
  });

  it('spawn した玉は指定位置に静止した状態で生まれる', () => {
    const pool = new BallPool(10);
    const b = pool.spawn(100, 50)!;
    expect(b.x).toBe(100);
    expect(b.y).toBe(50);
    expect(b.px).toBe(100); // 前フレーム位置が同じ = 速度ゼロ
    expect(b.py).toBe(50);
    expect(b.weight).toBe(1);
    expect(b.gateMask).toBe(0);
    expect(b.bounce).toBe(0);
    expect(b.sleeping).toBe(false);
  });

  it('容量を超えて spawn すると null を返す', () => {
    const pool = new BallPool(2);
    expect(pool.spawn(0, 0)).not.toBeNull();
    expect(pool.spawn(0, 0)).not.toBeNull();
    expect(pool.spawn(0, 0)).toBeNull();
    expect(pool.activeCount).toBe(2);
  });

  it('kill した枠は再利用される', () => {
    const pool = new BallPool(2);
    const a = pool.spawn(0, 0)!;
    pool.spawn(0, 0);
    expect(pool.spawn(0, 0)).toBeNull();
    pool.kill(a);
    expect(pool.activeCount).toBe(1);
    expect(pool.spawn(5, 5)).not.toBeNull();
    expect(pool.activeCount).toBe(2);
  });

  it('forEachActive は生きている玉だけを回す', () => {
    const pool = new BallPool(5);
    const a = pool.spawn(1, 1)!;
    pool.spawn(2, 2);
    pool.spawn(3, 3);
    pool.kill(a);
    const seen: number[] = [];
    pool.forEachActive((b) => seen.push(b.x));
    expect(seen.sort()).toEqual([2, 3]);
  });

  it('spawn 時に weight / bounce / gateMask を指定できる', () => {
    const pool = new BallPool(3);
    const b = pool.spawn(0, 0, { weight: 500, bounce: 2, gateMask: 5 })!;
    expect(b.weight).toBe(500);
    expect(b.bounce).toBe(2);
    expect(b.gateMask).toBe(5);
  });

  it('clear で全部が解放されて再利用できる', () => {
    const pool = new BallPool(3);
    pool.spawn(0, 0);
    pool.spawn(0, 0);
    pool.spawn(0, 0);
    expect(pool.spawn(0, 0)).toBeNull();
    pool.clear();
    expect(pool.activeCount).toBe(0);
    expect(pool.spawn(1, 1)).not.toBeNull();
  });
});
