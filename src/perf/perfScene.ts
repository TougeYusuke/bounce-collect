import { BallPool } from '../core/ball';
import { CONFIG } from '../core/config';
import { SpatialGrid } from '../core/grid';
import { step } from '../core/solver';
import type { World } from '../core/world';

/** V字の底を持つ箱。玉が中央に寄って積もる（実際のラウンド1に近い形） */
export function createPerfWorld(): World {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;
  return {
    width: w,
    height: h,
    segments: [
      { x1: 0, y1: h - 120, x2: w / 2, y2: h - 20 }, // 左の傾斜
      { x1: w, y1: h - 120, x2: w / 2, y2: h - 20 }, // 右の傾斜
    ],
  };
}

const STEP_OPTIONS = {
  gravity: CONFIG.GRAVITY,
  damping: CONFIG.DAMPING,
  radius: CONFIG.BALL_RADIUS,
  maxSpeed: CONFIG.MAX_SPEED,
  restitution: CONFIG.WALL_RESTITUTION,
  iterations: CONFIG.COLLISION_ITERATIONS,
  sleepVelocity: CONFIG.SLEEP_VELOCITY,
  sleepFrames: CONFIG.SLEEP_FRAMES,
};

export class PerfScene {
  readonly world = createPerfWorld();
  readonly pool: BallPool;
  readonly target: number;
  private grid: SpatialGrid;
  private spawned = 0;
  private spawnCursor = 0;

  constructor(target: number) {
    this.target = target;
    this.pool = new BallPool(target);
    this.grid = new SpatialGrid(this.world.width, this.world.height, CONFIG.BALL_RADIUS * 2);
  }

  get spawnedCount(): number {
    return this.spawned;
  }

  get sleepingCount(): number {
    let n = 0;
    this.pool.forEachActive((b) => {
      if (b.sleeping) n++;
    });
    return n;
  }

  /**
   * 生成位置が空いているか。
   * 埋まっているのに生やすと、生まれた瞬間から玉が重なって物理が壊れる。
   */
  private isFree(x: number, y: number): boolean {
    const min = CONFIG.BALL_RADIUS * 2;
    let free = true;
    this.grid.forEachNeighbor(x, y, (i) => {
      if (!free) return;
      const b = this.pool.balls[i];
      if (!b.alive) return;
      if (Math.hypot(b.x - x, b.y - y) < min) free = false;
    });
    return free;
  }

  /** 1フレームぶん進める。substeps を上げると早送りになる */
  update(substeps: number, spawnAttemptsPerFrame: number): void {
    for (let i = 0; i < spawnAttemptsPerFrame && this.spawned < this.target; i++) {
      // 乱数を使わず決定論的に散らす（同じ条件なら毎回同じ結果を測れる）
      const t = this.spawnCursor++;
      const x =
        this.world.width * 0.5 + Math.sin(t * 1.7) * this.world.width * 0.4;
      const y = CONFIG.BALL_RADIUS * 3;
      if (!this.isFree(x, y)) continue;
      if (this.pool.spawn(x, y)) this.spawned++;
    }

    for (let s = 0; s < substeps; s++) {
      step(this.pool, this.grid, this.world, STEP_OPTIONS);
    }
  }
}
