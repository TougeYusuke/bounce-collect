import { BallPool } from './ball';
import { CONFIG } from './config';
import { applyGates } from './gates';
import { SpatialGrid } from './grid';
import { applyJumpers } from './jumpers';
import { step, wake, wakeUnsupported } from './solver';
import { createFixedStage, scaleGateCapacity, stageToWorld, type Stage } from './stage';
import type { World } from './world';

const STEP_OPTIONS = {
  gravity: CONFIG.GRAVITY,
  damping: CONFIG.DAMPING,
  radius: CONFIG.BALL_RADIUS,
  maxSpeed: CONFIG.MAX_SPEED,
  restitution: CONFIG.WALL_RESTITUTION,
  iterations: CONFIG.COLLISION_ITERATIONS,
  sleepVelocity: CONFIG.SLEEP_VELOCITY,
  // 眠りを切ると玉は常に動き続ける（宙で固まる違和感を無くす・れいあ判断）
  sleepFrames: CONFIG.SLEEP_ENABLED ? CONFIG.SLEEP_FRAMES : 0,
};

/** 何も動かなくなってから、終了と判断するまでの猶予 */
const QUIET_FRAMES = 45;

/** R1=増やすラウンド ／ R2=溜めて放流するラウンド。違うのは底の挙動だけ */
export type RoundMode = 'r1' | 'r2';

export interface SessionOptions {
  /** 描画・計算する玉の上限。テストから小さくして軽く回すために外から渡せる */
  maxBalls?: number;
  /** ラウンド開始時の持ち玉 */
  initialBalls?: number;
  /** 既定 'r1' */
  mode?: RoundMode;
  /** r2 のみ: 配る総量（＝R1の回収数）。玉数に収まらないぶんは weight にまとめる */
  supplyTotal?: number;
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
  readonly mode: RoundMode;
  /** このラウンドで配る玉数（R1では initialBalls と同じ） */
  readonly supplyBalls: number;
  /** 1玉あたりの weight（R1は常に1） */
  readonly supplyWeight: number;
  private grid: SpatialGrid;

  score = 0;
  supplied = 0;
  finished = false;
  /** r2: 傾斜板が抜けて放流が始まったか。r1 では常に false */
  released = false;
  cupX = CONFIG.BOARD_WIDTH / 2;
  /** 最初の入力があるまで玉を出さない（勝手に始まらないように） */
  started = false;

  private supplyTimer: number = CONFIG.SUPPLY_INTERVAL; // 開始直後に1個目を出す
  /** 配り終わってから進んだフレーム数（R2の放流タイミングに使う） */
  private sinceSupplyDone = 0;
  private quiet = 0;
  /** 開始してから進んだフレーム数（時間切れの判定に使う） */
  elapsed = 0;
  /** 最後に回収が起きてからのフレーム数（詰まり検知に使う） */
  private sinceCollect = 0;
  private agitateTimer = 0;
  private agitatePulse = 0;

  constructor(stage: Stage = createFixedStage(), opts: SessionOptions = {}) {
    this.stage = stage;
    this.world = stageToWorld(stage);
    this.maxBalls = opts.maxBalls ?? CONFIG.MAX_BALLS;
    this.initialBalls = opts.initialBalls ?? CONFIG.INITIAL_BALLS;
    this.mode = opts.mode ?? 'r1';
    if (this.mode === 'r2') {
      const total = Math.max(1, Math.floor(opts.supplyTotal ?? 0));
      this.supplyBalls = Math.min(CONFIG.R2_SUPPLY_BALLS, total);
      // ⚠️ 切り上げ。切り捨てると供給がR1の結果を下回り、積み上げた実感が消える
      this.supplyWeight = Math.ceil(total / this.supplyBalls);
      // ⚠️ ゲート容量は weight 単位で減る。R2の重い玉だと1個で使い切ってしまうので、
      //    通せる「玉の個数」がR1と揃うように容量を引き上げる
      scaleGateCapacity(stage, this.supplyWeight);
    } else {
      this.supplyBalls = this.initialBalls;
      this.supplyWeight = 1;
    }
    this.pool = new BallPool(this.maxBalls);
    this.grid = new SpatialGrid(
      this.world.width,
      this.world.height,
      CONFIG.BALL_RADIUS * 2,
    );
  }

  /** いま玉を出している最中か（上バケツを傾ける演出に使う） */
  get dispensing(): boolean {
    return this.started && this.supplied < this.initialBalls;
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

  /**
   * 漏斗の壁を「中身の詰まった台形」として締める（貫通の背止め）。
   * 線分の衝突だけだと、山の圧力による位置補正が1フレームで線を押し越え、
   * 玉が壁の中へ抜ける（れいあ指摘・実測）。
   * 浅くめり込んだ玉は表面へ戻し、深く抜け切った玉はその場で回収する
   * （どうせ数十px下の回収ラインで回収される玉なので、スコアは失わない）。
   */
  private enforceWedges(): void {
    const wedges = this.stage.wedges;
    if (!wedges || wedges.length === 0) return;
    const r = CONFIG.BALL_RADIUS;
    const deep = r * 2.5;
    const dead: number[] = [];
    // ⚠️ R2の溜め中は、深く食い込んだ玉も回収に変えず必ず面へ押し戻す。
    // 変えてしまうと「溜めているはずの玉」がスコアに化けて漏れ出す。
    const holding = this.mode === 'r2' && !this.released;

    this.pool.forEachActive((b, i) => {
      for (const wd of wedges) {
        if (b.x < wd.x1 || b.x > wd.x2) continue;
        const t = (b.x - wd.x1) / (wd.x2 - wd.x1);
        const surfaceY = wd.y1 + (wd.y2 - wd.y1) * t;
        const sink = b.y - (surfaceY - r); // どれだけ面に食い込んでいるか
        if (sink <= 0) break;
        if (sink < deep || holding) {
          b.y = surfaceY - r; // 表面へ戻す
          if (b.py < b.y) b.py = b.y; // 下向きの速度だけ消す
        } else {
          dead.push(i); // 完全に抜けた: 回収に変える
        }
        break;
      }
    });

    for (const i of dead) {
      const b = this.pool.balls[i];
      this.score += b.weight;
      this.pool.kill(b);
    }
  }

  /**
   * 溜まったら傾斜板を抜いて放流に移る（R2のフィニッシュ）。
   *
   * ⚠️ 判定は weight 総和ではなく「玉数」。weight は供給量に比例して青天井なので、
   *    固定閾値だと配置やR1の出来次第で「即発動」か「永久に未達」に振れる（設計書 §4.4）。
   */
  private tryRelease(): void {
    if (this.mode !== 'r2' || this.released) return;
    const filled = this.pool.activeCount >= this.maxBalls * CONFIG.RELEASE_FILL_RATIO;
    // 待たせない保険: 配り終わって一定時間経ったら、溜まり切らなくても流す。
    // ⚠️ 「動きが止まったら」では判定できない（眠りを切ってあり、R2は回収もしないので
    //    awakeCount も activeCount も減らない）。経過フレームで見る。
    const settled = this.sinceSupplyDone >= CONFIG.RELEASE_SETTLE_FRAMES;
    if (!filled && !settled) return;

    this.released = true;
    // ⚠️ 物理の背止め（wedges）と、当たり判定＋描画が見ている線分（segments / world.segments）の
    //    両方から傾斜を取り除くこと。片方だけだと「見えない板に載る」か
    //    「見えている板をすり抜ける」のどちらかになる。
    const removed = new Set(this.stage.wedges ?? []);
    this.stage.wedges = [];
    this.stage.segments = this.stage.segments.filter((s) => !removed.has(s as never));
    this.world.segments = this.world.segments.filter((s) => !removed.has(s as never));
  }

  /** 回収ラインを越えた玉をスコアに変えて消す */
  collect(): void {
    // ⚠️ R2は放流が始まるまで回収しない（溜めるのがこのラウンドの目的）
    if (this.mode === 'r2' && !this.released) return;
    const dead: number[] = [];
    this.pool.forEachActive((b, i) => {
      if (b.y >= this.stage.collectY) {
        this.score += b.weight;
        dead.push(i);
      }
    });
    for (const i of dead) {
      const b = this.pool.balls[i];
      this.pool.kill(b);
      // 消えた玉の周りを起こす。支えを失った玉が眠ったまま宙に残らないように
      this.grid.forEachNeighbor(b.x, b.y, (ni) => {
        const n = this.pool.balls[ni];
        if (n.alive && n.sleeping) wake(n);
      });
    }
    if (dead.length > 0) this.sinceCollect = 0;
  }

  /**
   * 出口の詰まり崩し（アジテータ）。
   * 出口の上で玉が組む「アーチ（橋）」は安定していて自然には崩れない。
   * 実世界のホッパーがバイブレータで崩すのと同じで、回収が途絶えている時だけ
   * 出口付近の眠り玉を起こし、わずかに横へずらして組み直しを防ぐ。
   */
  private agitate(): void {
    const p = this.stage.agitate;
    if (!p || CONFIG.AGITATE_INTERVAL <= 0) return;
    if (this.sinceCollect < 30) return; // 流れている間は触らない
    this.agitateTimer++;
    if (this.agitateTimer < CONFIG.AGITATE_INTERVAL) return;
    this.agitateTimer = 0;
    this.agitatePulse++;

    const r = CONFIG.BALL_RADIUS * CONFIG.AGITATE_RADIUS;
    const rSq = r * r;
    // 毎回同じアーチが組み直されないよう、左右交互にずらす（乱数は使わない）
    const nudge = this.agitatePulse % 2 === 0 ? 0.8 : -0.8;
    this.pool.forEachActive((b) => {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy > rSq) return;
      if (b.sleeping) {
        wake(b);
        b.x += nudge;
      }
    });
  }

  /**
   * 玉を出す。
   *
   * ⚠️ 供給間隔は短くできない。玉が自分の直径ぶん落ちるのに
   *    √(直径 / (0.5×GRAVITY)) ≈ 9フレームかかり、それより速く同じ位置に出すと
   *    生まれた瞬間から玉が重なって物理が壊れる（設計書2026-07-23 §10.2）。
   *    ⚠️ pool.spawn に位置の埋まりチェックは無い（空きスロット切れでしか失敗しない）。
   *    止めてくれないので、呼ぶ側が間隔を守ること。
   *    R2は大量に配る必要があるので、縦ではなく**横に並べて**1回に複数個出す。
   */
  private supply(): void {
    if (!this.started) return;
    if (this.supplied >= this.supplyBalls) return;
    this.supplyTimer++;
    const interval = this.mode === 'r2' ? CONFIG.R2_SUPPLY_INTERVAL : CONFIG.SUPPLY_INTERVAL;
    if (this.supplyTimer < interval) return;
    this.supplyTimer = 0;

    const y = CONFIG.CUP_Y + CONFIG.BALL_RADIUS * 2;
    const perTick = this.mode === 'r2' ? CONFIG.R2_SUPPLY_PER_TICK : 1;
    const spacing = CONFIG.BALL_RADIUS * 2;
    const opts = this.mode === 'r2' ? { weight: this.supplyWeight } : undefined;

    for (let i = 0; i < perTick; i++) {
      if (this.supplied >= this.supplyBalls) break;
      // cupX を中心に、直径ぶんずつ左右へ振り分けて並べる（0, -1, +1, -2, +2 …）
      const step = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
      const x = this.cupX + step * spacing;
      if (this.pool.spawn(x, y, opts)) this.supplied++;
    }
  }

  /** substeps を上げると早送りになる（速度スライダー） */
  update(substeps: number): void {
    if (this.finished) return;

    for (let s = 0; s < substeps; s++) {
      this.supply();
      step(this.pool, this.grid, this.world, STEP_OPTIONS);
      this.enforceWedges();
      applyGates(this.pool, this.stage, this.maxBalls, CONFIG.BALL_RADIUS * 2);
      applyJumpers(this.pool, this.stage, CONFIG.MAX_BOUNCE);
      this.tryRelease();
      this.collect();

      if (this.started) this.elapsed++;
      if (this.started && this.supplied >= this.supplyBalls) this.sinceSupplyDone++;
      this.sinceCollect++;
      this.agitate();
      // 支えを失ったまま眠っている玉を起こす（8分割で巡回するので軽い）
      wakeUnsupported(this.pool, this.grid, this.world, CONFIG.BALL_RADIUS, this.elapsed);

      // ⚠️ 終了判定は「盤面が空になったら」ではなく「もう何も動かなくなったら」。
      // 傾斜や板の上で眠って止まる玉が必ず出るので、空になるのを待つと
      // ラウンドが永久に終わらない（実測: 1個が誘導板に乗って3000フレーム経過）。
      // 開始前は終了判定を走らせない（タップ待ちの間に終わってしまう）
      const settled =
        this.started && this.supplied >= this.supplyBalls && this.awakeCount === 0;
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
