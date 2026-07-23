import { BallPool } from './ball';
import { CONFIG } from './config';
import { applyGates } from './gates';
import { SpatialGrid } from './grid';
import { applyJumpers } from './jumpers';
import { step } from './solver';
import { createFixedStage, stageToWorld, type Stage } from './stage';
import type { World } from './world';

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

/** 何も動かなくなってから、終了と判断するまでの猶予 */
const QUIET_FRAMES = 45;

export interface SessionOptions {
  /** 描画・計算する玉の上限。テストから小さくして軽く回すために外から渡せる */
  maxBalls?: number;
  /** ラウンド開始時の持ち玉 */
  initialBalls?: number;
}

/**
 * 1ラウンドぶんの進行。
 * core の他と同じく描画も入力も知らないので、テストから直接回せる。
 */
export class Session {
  readonly stage: Stage;
  readonly world: World;
  readonly pool: BallPool;
  readonly maxBalls: number;
  readonly initialBalls: number;
  private grid: SpatialGrid;

  score = 0;
  supplied = 0;
  finished = false;
  cupX = CONFIG.BOARD_WIDTH / 2;
  /** 最初の入力があるまで玉を出さない（勝手に始まらないように） */
  started = false;

  private supplyTimer: number = CONFIG.SUPPLY_INTERVAL; // 開始直後に1個目を出す
  private quiet = 0;
  /** 開始してから進んだフレーム数（時間切れの判定に使う） */
  elapsed = 0;

  constructor(stage: Stage = createFixedStage(), opts: SessionOptions = {}) {
    this.stage = stage;
    this.world = stageToWorld(stage);
    this.maxBalls = opts.maxBalls ?? CONFIG.MAX_BALLS;
    this.initialBalls = opts.initialBalls ?? CONFIG.INITIAL_BALLS;
    this.pool = new BallPool(this.maxBalls);
    this.grid = new SpatialGrid(
      this.world.width,
      this.world.height,
      CONFIG.BALL_RADIUS * 2,
    );
  }

  /** 眠っていない（＝まだ何か起きうる）玉の数 */
  get awakeCount(): number {
    let n = 0;
    this.pool.forEachActive((b) => {
      if (!b.sleeping) n++;
    });
    return n;
  }

  setCupX(x: number): void {
    const m = CONFIG.CUP_MARGIN;
    this.cupX = Math.min(CONFIG.BOARD_WIDTH - m, Math.max(m, x));
  }

  /** 最初のタップで落とし始める */
  start(): void {
    this.started = true;
  }

  /** 回収ラインを越えた玉をスコアに変えて消す */
  collect(): void {
    const dead: number[] = [];
    this.pool.forEachActive((b, i) => {
      if (b.y >= this.stage.collectY) {
        this.score += b.weight;
        dead.push(i);
      }
    });
    for (const i of dead) this.pool.kill(this.pool.balls[i]);
  }

  private supply(): void {
    if (!this.started) return;
    if (this.supplied >= this.initialBalls) return;
    this.supplyTimer++;
    if (this.supplyTimer < CONFIG.SUPPLY_INTERVAL) return;
    this.supplyTimer = 0;
    if (this.pool.spawn(this.cupX, CONFIG.BALL_RADIUS * 4)) this.supplied++;
  }

  /** substeps を上げると早送りになる（速度スライダー） */
  update(substeps: number): void {
    if (this.finished) return;

    for (let s = 0; s < substeps; s++) {
      this.supply();
      step(this.pool, this.grid, this.world, STEP_OPTIONS);
      applyGates(this.pool, this.stage, this.maxBalls, CONFIG.BALL_RADIUS * 2);
      applyJumpers(this.pool, this.stage, CONFIG.MAX_BOUNCE);
      this.collect();

      if (this.started) this.elapsed++;

      // ⚠️ 終了判定は「盤面が空になったら」ではなく「もう何も動かなくなったら」。
      // 傾斜や板の上で眠って止まる玉が必ず出るので、空になるのを待つと
      // ラウンドが永久に終わらない（実測: 1個が誘導板に乗って3000フレーム経過）。
      // 開始前は終了判定を走らせない（タップ待ちの間に終わってしまう）
      const settled =
        this.started && this.supplied >= this.initialBalls && this.awakeCount === 0;
      this.quiet = settled ? this.quiet + 1 : 0;

      // 時間切れ。盤面が詰まって流れが止まっても待たせ続けない。
      // 傾斜を緩くすると流れが遅くなり、設定次第では自然には終わらなくなるため、
      // これを最後の砦として置く（実測: 34度で30秒経っても終わらなかった）。
      const timeUp = this.started && this.elapsed >= CONFIG.ROUND_TIME_LIMIT;

      if (this.quiet > QUIET_FRAMES || timeUp) {
        // 引っかかって残った玉も回収する（待たせるくらいなら拾わせる）
        this.pool.forEachActive((b) => {
          this.score += b.weight;
        });
        this.pool.clear();
        this.finished = true;
        return;
      }
    }
  }
}
