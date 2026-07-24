import { BallPool } from './ball';
import { CONFIG } from './config';
import { applyGates } from './gates';
import { SpatialGrid } from './grid';
import { applyJumpers } from './jumpers';
import { step, wake, wakeUnsupported } from './solver';
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
  /**
   * 玉を出す間隔（フレーム）。持ち玉の数から決まる。
   * 少なければゆっくり、多ければテンポよく（ただし物理の下限あり）。
   */
  readonly supplyInterval: number;
  private grid: SpatialGrid;

  score = 0;
  supplied = 0;
  finished = false;
  /** r2: 傾斜板が抜けて放流が始まったか。r1 では常に false */
  released = false;
  cupX = CONFIG.BOARD_WIDTH / 2;
  /** 最初の入力があるまで玉を出さない（勝手に始まらないように） */
  started = false;

  private supplyTimer = 0; // コンストラクタで supplyInterval を入れる（開始直後に1個目）
  /** 最初の玉を出すまでの待ち（R2でコップの位置を選ぶ間） */
  private supplyDelay = 0;
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
    } else {
      this.supplyBalls = this.initialBalls;
      this.supplyWeight = 1;
    }
    // 持ち玉が少なければゆっくり、多ければテンポよく出す（総供給時間を一定に寄せる）
    this.supplyInterval = Math.min(
      CONFIG.SUPPLY_INTERVAL_MAX,
      Math.max(
        CONFIG.SUPPLY_INTERVAL_MIN,
        Math.round(CONFIG.SUPPLY_SPREAD_FRAMES / this.supplyBalls),
      ),
    );
    this.supplyTimer = this.supplyInterval; // 開始直後に1個目を出す
    // ⚠️ R2はコップの位置を選ぶ間を置く（0だと切り替わった瞬間に落ち始める）
    this.supplyDelay = this.mode === 'r2' ? CONFIG.R2_START_DELAY_FRAMES : 0;
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

    this.pool.forEachActive((b, i) => {
      for (const wd of wedges) {
        if (b.x < wd.x1 || b.x > wd.x2) continue;
        const t = (b.x - wd.x1) / (wd.x2 - wd.x1);
        const surfaceY = wd.y1 + (wd.y2 - wd.y1) * t;
        const sink = b.y - (surfaceY - r); // どれだけ面に食い込んでいるか
        if (sink <= 0) break;
        if (sink < deep) {
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
   * 詰まり防止に傾斜板を抜いて、残りを一気に流す（R2のフィニッシュ）。
   *
   * ⚠️ R2も出口から出た玉は最初からスコアになる。板を抜くのは
   *    「詰まって流れが止まるのを防ぐ」ためであって、スコアを止めるためではない
   *    （2026-07-24 れいあ指摘で訂正）。
   */
  private tryRelease(): void {
    if (this.mode !== 'r2' || this.released) return;
    const scored = this.score >= CONFIG.RELEASE_SCORE;
    // 保険: 配り終わったのに回収が途絶えた＝詰まっている。待たせ続けない
    const jammed =
      this.supplied >= this.supplyBalls && this.sinceCollect >= CONFIG.RELEASE_SETTLE_FRAMES;
    if (!scored && !jammed) return;

    this.released = true;
    // ⚠️ 物理の背止め（wedges）と、当たり判定＋描画が見ている線分（segments / world.segments）の
    //    両方から傾斜を取り除くこと。片方だけだと「見えない板に載る」か
    //    「見えている板をすり抜ける」のどちらかになる。
    const removed = new Set(this.stage.wedges ?? []);
    this.stage.wedges = [];
    this.stage.segments = this.stage.segments.filter((s) => !removed.has(s as never));
    this.world.segments = this.world.segments.filter((s) => !removed.has(s as never));
  }

  /** 回収ラインを越えた玉をスコアに変えて消す。R1・R2とも常に有効 */
  collect(): void {
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
    // R2は切り替わった直後に落ち始めないよう、コップの位置を選ぶ間を置く
    if (this.supplyDelay > 0) {
      this.supplyDelay--;
      return;
    }
    this.supplyTimer++;
    if (this.supplyTimer < this.supplyInterval) return;
    this.supplyTimer = 0;

    // 常に1個ずつ、コップの口の真下から出す
    const y = CONFIG.CUP_Y + CONFIG.BALL_RADIUS * 2;
    const opts = this.mode === 'r2' ? { weight: this.supplyWeight } : undefined;
    if (this.pool.spawn(this.cupX, y, opts)) this.supplied++;
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
      // ⚠️ 「配り終わった」だけでは足りない。R2は回収しないので盤面が満杯になると
      //    spawn が失敗して supplied が増えなくなり、放流が永久に来ない（実測）。
      //    もう玉を足せない状態＝溜まりきった、として同じ扱いにする。
      const stalled =
        this.supplied >= this.supplyBalls || this.pool.activeCount >= this.maxBalls;
      if (this.started && stalled) this.sinceSupplyDone++;
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
