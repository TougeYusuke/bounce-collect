import { BallPool } from './ball';
import { CONFIG } from './config';
import {
  cupDropOffsetX,
  cupLocalToWorld,
  cupPourDirection,
  cupRollFrames,
  cupRollStart,
  type CupPoint,
} from './cupPose';
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
  growPerFrame: (1 - CONFIG.SPAWN_GROW_START) / CONFIG.SPAWN_GROW_FRAMES,
  sideRestitution: CONFIG.WALL_SIDE_RESTITUTION,
  sidePush: CONFIG.WALL_SIDE_PUSH,
  rollRelease: CONFIG.CUP_ROLL_RELEASE,
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
  /**
   * ⚠️ 「重い玉」は廃止（2026-07-24 れいあ裁定）。配る玉は R1/R2 とも常に weight 1。
   *    個数とスコアを常に一致させるため（残数が2以上減る見え方をなくす）。
   */
  /**
   * 玉を出す間隔（フレーム）。持ち玉の数から決まる。
   * 少なければゆっくり、多ければテンポよく（ただし物理の下限あり）。
   */
  readonly supplyInterval: number;
  private grid: SpatialGrid;

  score = 0;
  /**
   * 実際に回収した**玉の個数**（スコアと違って中身の重さを掛けない）。
   * ⚠️ スコアは weight の合計なので、盤面が満杯になると1個で数百〜数千入る。
   *    「玉の数」と「スコア」がどれだけ乖離しているかを見るための数字（デバッグ用）。
   */
  collectedBalls = 0;
  supplied = 0;
  finished = false;
  /** r2: 傾斜板が抜けて放流が始まったか。r1 では常に false */
  released = false;
  cupX = CONFIG.BOARD_WIDTH / 2;
  /**
   * 上バケツの傾き（ラジアン）。目標角へ毎フレームじわっと寄る。
   *
   * ⚠️ **描画側から渡さない**（2026-07-25 に Session 持ちへ移した）。
   *    傾きが main.ts のローカル変数だった頃、テストから `Session` を直接回すと
   *    ずっと直立のままで、**本番と違う姿勢**でしか検証できなかった。
   *    描画はこの値を読むだけ＝テストで見ている姿勢と実機の姿勢が必ず一致する。
   */
  cupTilt = 0;
  /** 最初の入力があるまで玉を出さない（勝手に始まらないように） */
  started = false;

  private supplyTimer = 0; // コンストラクタで supplyInterval を入れる（開始直後に1個目）
  /** 最初の玉を出すまでの待ち（R2でコップの位置を選ぶ間） */
  private supplyDelay = 0;
  /** 配り終わってから進んだフレーム数（R2の放流タイミングに使う） */
  private sinceSupplyDone = 0;
  private quiet = 0;
  /**
   * 配り終わったのに回収が1個も進まないまま経ったフレーム数。
   * ⚠️ ラウンドを切る唯一の保険（時間では切らない・`CONFIG.STALL_LIMIT_FRAMES`）。
   */
  private stallFrames = 0;
  private lastCollected = 0;
  /** 開始してから進んだフレーム数（表示に使う） */
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
      // ⚠️ R1で集めた**個数をそのまま**配る（2026-07-24 れいあ裁定）。
      //    以前は上限100個に収めて「重い玉」で総量を合わせていたが、
      //    「1個出したのに残数が2以上減る」ことになり、R1で稼いだぶんが**玉の量として見えない**。
      //    ここは「R1で稼ぐほどR2に大量の玉が降る」インフレ感が要なので、個数＝スコアで揃える。
      this.supplyBalls = Math.max(1, Math.floor(opts.supplyTotal ?? 0));
    } else {
      this.supplyBalls = this.initialBalls;
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

  /**
   * 実際に玉を回収する高さ。
   *
   * ⚠️ R1は下バケツの口（stage.collectY）で消す＝バケツに入ったように見える。
   *    R2はバケツが無いので、同じ高さで消すと**盤面の下に空白を残して空中で消えた**
   *    ように見える（れいあ指摘）。R2は床まで落としてから回収する。
   */
  private get collectLine(): number {
    return this.mode === 'r2'
      ? CONFIG.BOARD_HEIGHT - CONFIG.BALL_RADIUS
      : this.stage.collectY;
  }

  /**
   * 玉を出す時の下向きの初速。
   * 配る間隔が下限（＝一番テンポが速い）なら `CUP_DROP_SPEED_MAX`、上限なら 0。
   */
  private get dropSpeed(): number {
    const span = CONFIG.SUPPLY_INTERVAL_MAX - CONFIG.SUPPLY_INTERVAL_MIN;
    if (span <= 0) return 0;
    const fast = (CONFIG.SUPPLY_INTERVAL_MAX - this.supplyInterval) / span;
    return CONFIG.CUP_DROP_SPEED_MAX * Math.min(1, Math.max(0, fast));
  }

  /** 1秒あたり何個配っているか（デバッグ表示用） */
  get ballsPerSecond(): number {
    return 60 / this.supplyInterval;
  }

  /**
   * コップに残っている**個数**（これから出てくるぶん）。カップの横に出す。
   * ⚠️ 個数と総量は常に一致する（重い玉を作らないので・2026-07-24）。
   */
  get remaining(): number {
    return Math.max(0, this.supplyBalls - this.supplied);
  }

  /** いま玉を出している最中か（上バケツを傾ける演出に使う） */
  get dispensing(): boolean {
    return this.started && this.supplied < this.supplyBalls;
  }

  /**
   * いま目指している傾き。タップ前は直立、注ぎ始めたら
   * R1＝口が横を向く角度（なぞる位置で左右が入れ替わる）／R2＝**真下**（ひっくり返して大量に流す）。
   */
  get targetTilt(): number {
    if (!this.started) return 0;
    return this.mode === 'r2' ? CONFIG.CUP_DUMP_TILT : CONFIG.CUP_POUR_TILT;
  }

  /**
   * 注げるところまで傾いたか。
   * ⚠️ 直立のまま注ぐと「口の向き＝ほぼ真上」に転がり出て玉が上へ飛ぶ。
   *    バケツは**傾いてから注ぐ**（約19フレーム＝0.32秒でここに来る）。
   */
  get pouring(): boolean {
    const t = this.targetTilt;
    return t !== 0 && this.cupTilt >= t * CONFIG.CUP_POUR_READY;
  }

  /**
   * 1回に出す玉の数。
   * R1は常に1個（4個しか配らないので刻む意味がない）。
   * R2は「配り切るのにかけたい時間（`SUPPLY_SPREAD_FRAMES`）」に収まるよう、まとめて出す
   * （＝れいあ要望「重い球でなく**出す量**で調整する」2026-07-25）。
   */
  get dumpCount(): number {
    if (this.mode !== 'r2') return 1;
    const ticks = Math.max(1, CONFIG.SUPPLY_SPREAD_FRAMES / this.supplyInterval);
    return Math.min(CONFIG.R2_DUMP_MAX, Math.max(1, Math.ceil(this.supplyBalls / ticks)));
  }

  /** 盤面で一番重い玉の中身（デバッグ用）。1なら飽和がまだ起きていない */
  get heaviestBall(): number {
    let m = 0;
    this.pool.forEachActive((b) => {
      if (b.weight > m) m = b.weight;
    });
    return m;
  }

  /** 眠っていない（＝まだ何か起きうる）玉の数 */
  get awakeCount(): number {
    let n = 0;
    this.pool.forEachActive((b) => {
      if (!b.sleeping) n++;
    });
    return n;
  }

  /**
   * バケツの位置。
   *
   * ⚠️ 受け取るのは「**玉を落としたい場所**」であって、バケツの中心ではない。
   *    玉は口の**縁**から出るので、カップ中心から約48px ずれた所に落ちる。その分だけ逆へ寄せる。
   *
   * 🔑 **止めるのはカップの位置ではなく「落ちる場所」**（2026-07-25 れいあ指摘
   *    「左端に球を落とすことができなかった」）。カップの中心を画面内に収める形だと、
   *    左端に落とすには届かなかった（届く一番左が x=72 だった）。
   * ⚠️ そのぶん左端を狙うと**カップが画面から見切れる**。れいあ裁定で見切れてよい
   *    （左右で注ぐ向きを入れ替える案は「挙動が気持ち悪い」で不採用）。
   */
  setCupX(x: number): void {
    const drop = Math.min(CONFIG.BOARD_WIDTH, Math.max(0, x));
    this.cupX = drop - this.dropOffsetX;
  }

  /**
   * 玉が実際に落ち始める場所と、カップ中心とのズレ。
   * R2は真下へ注ぐのでズレは無い（口の中心＝カップの軸）。
   */
  get dropOffsetX(): number {
    return this.mode === 'r2' ? 0 : cupDropOffsetX();
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
      this.score += b.weight; // R1は必ず1。R2は引き継いだぶんの個数
      this.collectedBalls++;
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
    const line = this.collectLine;
    this.pool.forEachActive((b, i) => {
      if (b.y >= line) {
        this.score += b.weight;
        this.collectedBalls++;
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
   * その場所が既に埋まっているか。
   * ⚠️ `pool.spawn` に位置の埋まりチェックは無い（空きスロット切れでしか失敗しない）。
   *    埋まっているのに湧かせると、生まれた瞬間から玉が重なって物理が壊れる。
   *    ⚠️ 見ているのは**前フレームの grid**（supply は step より先に走る）。1フレームぶんの
   *    ズレはあるが、玉は1フレームで半径ほどしか動かないので実用上これで足りる。
   */
  private occupied(x: number, y: number): boolean {
    const minSq = (CONFIG.BALL_RADIUS * 2 * 0.85) ** 2;
    let hit = false;
    this.grid.forEachNeighbor(x, y, (i) => {
      if (hit) return;
      const o = this.pool.balls[i];
      if (!o.alive) return;
      const dx = o.x - x;
      const dy = o.y - y;
      if (dx * dx + dy * dy < minSq) hit = true;
    });
    return hit;
  }

  /**
   * R2でまとめて出す時の、i番目の玉の湧く場所（世界座標）。
   * 口の幅方向に `R2_DUMP_COLUMNS` 個並べ、あふれたぶんは口の**奥**へ積む。
   * ⚠️ 奥へ積むこと。手前（口の外）へ足すと、バケツの外の宙から玉が湧いて見える。
   */
  private dumpSlot(i: number): CupPoint {
    const d = CONFIG.BALL_RADIUS * 2 * CONFIG.R2_DUMP_SPACING;
    const cols = CONFIG.R2_DUMP_COLUMNS;
    // ⚠️ 横の中心は**カップの軸**（ローカル0＝開口部の中心）。`CUP_SPAWN_OFFSET_X` は
    //    1個ずつ出す時の調整点であって開口部の中心ではないので、ここに使うと左右非対称になる。
    const lx = CONFIG.CUP_TILT_PIVOT_OFFSET_X + ((i % cols) - (cols - 1) / 2) * d;
    const ly = CONFIG.CUP_SPAWN_OFFSET_Y + Math.floor(i / cols) * d;
    return cupLocalToWorld(this.cupX, this.cupTilt, lx, ly);
  }

  /**
   * 玉を出す。
   *
   * ⚠️ 供給間隔は短くできない。玉が自分の直径ぶん落ちるのに
   *    √(直径 / (0.5×GRAVITY)) ≈ 9フレームかかり、それより速く同じ位置に出すと
   *    生まれた瞬間から玉が重なって物理が壊れる（設計書2026-07-23 §10.2）。
   *    R2は**同じ場所に重ねず並べて**出すので、1回の個数は増やせる。
   */
  private supply(): void {
    if (!this.started) return;
    if (this.supplied >= this.supplyBalls) return;
    // ⚠️ 傾き切るまで注がない。直立のまま注ぐと口が真上を向いていて玉が上へ飛ぶ
    if (!this.pouring) return;
    // R2は切り替わった直後に落ち始めないよう、コップの位置を選ぶ間を置く
    if (this.supplyDelay > 0) {
      this.supplyDelay--;
      return;
    }
    this.supplyTimer++;
    if (this.supplyTimer < this.supplyInterval) return;
    this.supplyTimer = 0;

    if (this.mode === 'r1') {
      this.rollOut();
      return;
    }
    this.dump();
  }

  /**
   * R1: 底面の道の奥から1個出して、口の縁まで転がしてから落とす。
   *
   * ⚠️ 進む向きは**世界の真横ではなくカップのローカル -Y（口の向き）**
   *    ＝「横に向けたときに底辺になる面に沿って移動する」（2026-07-25 れいあ指定）。
   *    真横に流すと、傾いたカップの面から浮いて「発射」に見える。
   */
  private rollOut(): void {
    const p = cupRollStart(this.cupX, this.cupTilt);
    const b = this.pool.spawn(p.x, p.y, { rollFrames: cupRollFrames(CONFIG.CUP_SPAWN_VX) });
    if (!b) return;
    const d = cupPourDirection(this.cupTilt);
    b.px = b.x - d.x * CONFIG.CUP_SPAWN_VX;
    b.py = b.y - d.y * CONFIG.CUP_SPAWN_VX;
    this.supplied++;
  }

  /**
   * R2: ひっくり返したバケツから、口いっぱいに並べてまとめて落とす。
   *
   * ⚠️ 転がりも横向きの初速も付けない。傾きが `CUP_DUMP_TILT`（真下）なので
   *    そのまま落とせば偏らない。斜めに勢いを付けると全部が片側へ流れる（実測）。
   * ⚠️ 生まれたては当たり判定を小さくする（`SPAWN_GROW_START`）。まとめて出すぶん、
   *    フル半径だと既にある玉を強く押し出して上へ弾け飛ぶ。
   */
  private dump(): void {
    const n = this.dumpCount;
    // ⚠️ まとめて出す時は強く落とす。遅いと口の下が渋滞して、次の回が湧く場所を塞ぐ
    //    ＝1回の個数を増やしても実際の量が増えない（2026-07-25 実測）。
    //    1個ずつの時（持ち玉が少ない時）はこれまで通りテンポに合わせた速さ。
    const speed = n > 1 ? CONFIG.R2_DUMP_SPEED : this.dropSpeed;
    for (let i = 0; i < n && this.supplied < this.supplyBalls; i++) {
      const p = this.dumpSlot(i);
      if (this.occupied(p.x, p.y)) continue;
      const b = this.pool.spawn(p.x, p.y, { grow: CONFIG.SPAWN_GROW_START });
      if (!b) return; // 盤面がいっぱい。回収で空くまで待つ
      b.px = b.x;
      b.py = b.y - speed;
      this.supplied++;
    }
  }

  /** substeps を上げると早送りになる（速度スライダー） */
  update(substeps: number): void {
    if (this.finished) return;

    for (let s = 0; s < substeps; s++) {
      // ⚠️ 玉を出す前に傾ける。同じフレームに描く姿勢から玉が出るようにするため
      this.cupTilt += (this.targetTilt - this.cupTilt) * CONFIG.CUP_TILT_EASE;
      this.supply();
      step(this.pool, this.grid, this.world, STEP_OPTIONS);
      this.enforceWedges();
      applyGates(this.pool, this.stage, this.maxBalls, CONFIG.BALL_RADIUS * 2, this.grid);
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

      // ⚠️ 時間ではラウンドを切らない（2026-07-24 れいあ裁定「時間がかかるのもゲームのうち」）。
      //    切るのは**完全にはまって進まなくなった時だけ**＝配り終わっているのに
      //    STALL_LIMIT_FRAMES のあいだ1個も回収されない状態。
      //    ⚠️ 「動いているか」では見ない。眠りを切ってあるので awakeCount は 0 にならないし、
      //       アジテータが揺らしている間は動いて見えてしまう。**回収が進んだか**で見る。
      if (this.collectedBalls !== this.lastCollected) {
        this.lastCollected = this.collectedBalls;
        this.stallFrames = 0;
      } else if (this.started && stalled) {
        this.stallFrames++;
      } else {
        this.stallFrames = 0;
      }
      const jammed = this.stallFrames >= CONFIG.STALL_LIMIT_FRAMES;

      if (this.quiet > QUIET_FRAMES || jammed) {
        // 引っかかって残った玉も回収する（待たせるくらいなら拾わせる）
        this.pool.forEachActive((b) => {
          this.score += b.weight;
          this.collectedBalls++;
        });
        this.pool.clear();
        this.finished = true;
        return;
      }
    }
  }
}
