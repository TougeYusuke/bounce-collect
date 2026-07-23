import { describe, it, expect } from 'vitest';
import { BallPool } from '../src/core/ball';
import { SpatialGrid } from '../src/core/grid';
import { integrate, resolveBallCollisions, updateSleep, wake, step } from '../src/core/solver';
import { CONFIG } from '../src/core/config';

describe('integrate', () => {
  it('重力で下に加速する', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    integrate(b, 0.5, 1.0, 999);
    expect(b.y).toBeCloseTo(50.5);
    integrate(b, 0.5, 1.0, 999);
    expect(b.y).toBeCloseTo(51.5); // 速度が乗って加速する
  });

  it('前フレーム位置が更新される', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    integrate(b, 0.5, 1.0, 999);
    expect(b.py).toBeCloseTo(50);
  });

  it('damping が効くと速度が減衰する', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    b.px = 40; // 右向きに速度10
    integrate(b, 0, 0.5, 999);
    expect(b.x).toBeCloseTo(55); // 10 * 0.5 = 5 だけ進む
  });
});

describe('resolveBallCollisions', () => {
  it('重なった2つの玉が離れる', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const a = pool.spawn(50, 50)!;
    const b = pool.spawn(53, 50)!; // 半径5同士なので7だけ足りない
    resolveBallCollisions(pool, grid, 5, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(7);
  });

  it('離れた玉は動かない', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const a = pool.spawn(10, 10)!;
    pool.spawn(90, 90);
    resolveBallCollisions(pool, grid, 5, 1);
    expect(a.x).toBeCloseTo(10);
    expect(a.y).toBeCloseTo(10);
  });

  it('完全に同じ位置の玉でもクラッシュせず離れる', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const a = pool.spawn(50, 50)!;
    const b = pool.spawn(50, 50)!;
    expect(() => resolveBallCollisions(pool, grid, 5, 2)).not.toThrow();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
  });

  it('打ち上げ中(flying)の玉は他の玉をすり抜ける', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const flyer = pool.spawn(50, 50)!;
    const other = pool.spawn(53, 50)!;
    flyer.flying = true;
    resolveBallCollisions(pool, grid, 5, 1);
    expect(flyer.x).toBe(50); // どちらも押されない
    expect(other.x).toBe(53);
  });

  it('眠っている玉同士は、軽く触れている程度なら動かない', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const a = pool.spawn(50, 50)!;
    const b = pool.spawn(59.9, 50)!; // 直径10に対して 0.1 だけ重なる
    a.sleeping = true;
    b.sleeping = true;
    resolveBallCollisions(pool, grid, 5, 1);
    expect(a.x).toBe(50);
    expect(b.x).toBe(59.9);
  });

  it('眠っている玉同士でも、深く食い込んでいたら位置だけ直す（起きはしない）', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const a = pool.spawn(50, 50)!;
    const b = pool.spawn(53, 50)!; // 7 も食い込んでいる
    a.sleeping = true;
    b.sleeping = true;
    resolveBallCollisions(pool, grid, 5, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(3);
    expect(a.sleeping).toBe(true); // 起こさない
    expect(b.sleeping).toBe(true);
    expect(a.x - a.px).toBeCloseTo(0); // 速度も生まない
    expect(b.x - b.px).toBeCloseTo(0);
  });

  it('眠っている玉に起きている玉がぶつかると、起きている側だけが動いて相手が起きる', () => {
    const pool = new BallPool(4);
    const grid = new SpatialGrid(100, 100, 10);
    const sleeper = pool.spawn(50, 50)!;
    const mover = pool.spawn(53, 50)!;
    sleeper.sleeping = true;
    resolveBallCollisions(pool, grid, 5, 1);
    expect(sleeper.x).toBe(50); // 眠っている側は動かない
    expect(mover.x).toBeGreaterThan(53); // 押し出される
    expect(sleeper.sleeping).toBe(false); // 衝撃で起きる
  });
});

describe('updateSleep', () => {
  it('動かない玉が規定フレーム後に眠る', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    for (let i = 0; i < 9; i++) updateSleep(b, 0.06, 10);
    expect(b.sleeping).toBe(false);
    updateSleep(b, 0.06, 10);
    expect(b.sleeping).toBe(true);
  });

  it('動いている玉は眠らない', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    for (let i = 0; i < 30; i++) {
      b.px = b.x - 1; // 毎フレーム速度1で動いている
      updateSleep(b, 0.06, 10);
    }
    expect(b.sleeping).toBe(false);
  });

  it('眠った玉は速度がゼロになる', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    b.px = 49.99; // わずかに動いている
    for (let i = 0; i < 10; i++) updateSleep(b, 0.06, 10);
    expect(b.sleeping).toBe(true);
    expect(b.px).toBe(b.x);
    expect(b.py).toBe(b.y);
  });

  it('wake で起こせる', () => {
    const pool = new BallPool(1);
    const b = pool.spawn(50, 50)!;
    for (let i = 0; i < 10; i++) updateSleep(b, 0.06, 10);
    expect(b.sleeping).toBe(true);
    wake(b);
    expect(b.sleeping).toBe(false);
    expect(b.sleepFrames).toBe(0);
  });
});

describe('flying の解除', () => {
  const opts = {
    gravity: CONFIG.GRAVITY,
    damping: CONFIG.DAMPING,
    radius: CONFIG.BALL_RADIUS,
    maxSpeed: CONFIG.MAX_SPEED,
    restitution: CONFIG.WALL_RESTITUTION,
    iterations: 2,
    sleepVelocity: CONFIG.SLEEP_VELOCITY,
    sleepFrames: CONFIG.SLEEP_FRAMES,
  };

  it('頂点を過ぎて落ち始めたら すり抜けが解除される', () => {
    const world = { width: 100, height: 800, segments: [] };
    const pool = new BallPool(1);
    const grid = new SpatialGrid(world.width, world.height, 10);
    const b = pool.spawn(50, 600)!;
    b.py = b.y + 20; // 上向きに打ち上げた状態
    b.flying = true;

    let released = -1;
    for (let i = 0; i < 400; i++) {
      step(pool, grid, world, opts);
      if (!b.flying) { released = i; break; }
    }
    expect(released).toBeGreaterThan(0); // 打ち上げ直後には解除されない
    expect(b.flying).toBe(false); // いずれ必ず解除される
  });
});

describe('step', () => {
  const opts = {
    gravity: CONFIG.GRAVITY,
    damping: CONFIG.DAMPING,
    radius: CONFIG.BALL_RADIUS,
    maxSpeed: CONFIG.MAX_SPEED,
    restitution: CONFIG.WALL_RESTITUTION,
    iterations: CONFIG.COLLISION_ITERATIONS,
    sleepVelocity: CONFIG.SLEEP_VELOCITY,
    sleepFrames: CONFIG.SLEEP_FRAMES,
  };

  it('落ちた玉は最終的に底で止まって眠る', () => {
    const world = { width: 100, height: 200, segments: [] };
    const pool = new BallPool(1);
    const grid = new SpatialGrid(world.width, world.height, 10);
    const b = pool.spawn(50, 10)!;

    for (let i = 0; i < 600; i++) step(pool, grid, world, opts);

    expect(b.y).toBeCloseTo(world.height - opts.radius, 0);
    expect(b.sleeping).toBe(true);
  });

  it('玉が盤面の外に出ない', () => {
    const world = { width: 100, height: 200, segments: [] };
    const pool = new BallPool(60);
    const grid = new SpatialGrid(world.width, world.height, 10);
    for (let i = 0; i < 60; i++) pool.spawn(50 + (i % 7) - 3, 10 + i * 0.5);

    for (let i = 0; i < 600; i++) step(pool, grid, world, opts);

    // 許容は 1px。眠った玉は壁クランプをスキップするので、眠り玉同士のめり込み補正で
    // 壁をコンマ数px はみ出すことがある（見た目には出ない範囲）。
    pool.forEachActive((b) => {
      expect(b.x).toBeGreaterThanOrEqual(opts.radius - 1);
      expect(b.x).toBeLessThanOrEqual(world.width - opts.radius + 1);
      expect(b.y).toBeLessThanOrEqual(world.height - opts.radius + 1);
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
    });
  });

  /**
   * 実際のゲームに近い形（V字傾斜の箱に上から降らせる）で積もらせる。
   * 盤面の容量に対して詰め込みすぎない量にすること。
   * 面積で入り切らない量を入れると、物理の出来に関わらず必ず潰れる。
   */
  it('V字傾斜の箱に積もらせると、静止して眠り、めり込みが残らない', () => {
    const w = CONFIG.BOARD_WIDTH;
    const h = CONFIG.BOARD_HEIGHT;
    const world = {
      width: w,
      height: h,
      segments: [
        { x1: 0, y1: h - 120, x2: w / 2, y2: h - 20 },
        { x1: w, y1: h - 120, x2: w / 2, y2: h - 20 },
      ],
    };
    const count = 300;
    const pool = new BallPool(count);
    const grid = new SpatialGrid(w, h, CONFIG.BALL_RADIUS * 2);

    // 生成は間隔を空ける。毎フレーム大量に同じ高さへ生やすと、落ちる前に次が湧いて
    // 「生まれた瞬間に重なっている」玉ができる（物理の失敗ではなく供給側の失敗）。
    let spawned = 0;
    for (let i = 0; i < 2400; i++) {
      if (i % 3 === 0 && spawned < count) {
        pool.spawn(w * 0.5 + Math.sin(spawned * 1.7) * w * 0.4, 20);
        spawned++;
      }
      step(pool, grid, world, opts);
    }

    let sleeping = 0;
    let worst = Infinity;
    pool.forEachActive((a, ai) => {
      if (a.sleeping) sleeping++;
      pool.forEachActive((b, bi) => {
        if (bi <= ai) return;
        worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y));
      });
    });

    // 大半が眠っていること（眠らないと性能が出ないので、これは性能要件でもある）
    expect(sleeping).toBeGreaterThan(count * 0.7);
    // 極端なめり込みが残っていないこと（直径10に対して8以上）
    expect(worst).toBeGreaterThan(8);
  });
});
