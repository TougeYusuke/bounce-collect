import { CONFIG } from './config';
import { createRng } from './rng';
import { Session } from './session';
import { rollStage } from './stageRoll';
import { pickStageDef } from './stages';
import { buildStage, type StageDef } from './stageDef';

/**
 * 2ラウンドを順に回す層。
 *
 * R1（増やす）で積み上げた弾をR2（溜めて放流する）の供給に引き継ぎ、
 * R2の回収を最終スコアにする。
 *
 * ⚠️ R1の結果を最終スコアに足さないこと。R2の供給として消費済みなので二重計上になる。
 */
export class Match {
  session: Session;
  round: 1 | 2 = 1;
  /** R1で積み上げた弾（＝R2の供給量） */
  r1Score = 0;
  finished = false;
  finalScore = 0;
  /** R1が終わって、下のバケツが下へ抜けていく演出中か */
  transitioning = false;
  private transitionFrames = 0;

  /**
   * R1の盤面（型＋抽選した中身）。
   * ⚠️ **R2は別の盤面を引く**（2026-07-24 れいあ要望）。ラウンドごとに景色が変わる。
   */
  readonly def: StageDef;
  /** R2の盤面。R1とは独立に抽選する（同じ型を引くこともある） */
  readonly r2Def: StageDef;
  /** 抽選に使った種。⚠️ 同じ種なら型も中身も丸ごと同じ＝「さっきのをもう一度」が作れる */
  readonly seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed >>> 0;
    // ⚠️ 型を選ぶのも中身を振るのも**同じ乱数**から順に引く。種が同じなら丸ごと同じゲームになる
    const rng = createRng(this.seed);
    this.def = rollStage(pickStageDef(rng), rng);
    this.r2Def = rollStage(pickStageDef(rng), rng);
    this.session = new Session(buildStage(this.def));
  }

  /** いま遊んでいるラウンドの盤面（表示に使う） */
  get currentDef(): StageDef {
    return this.round === 1 ? this.def : this.r2Def;
  }

  /** 演出の進み具合（0→1）。下バケツをどれだけ下へずらすかに使う */
  get transitionProgress(): number {
    if (!this.transitioning) return 0;
    return Math.min(1, this.transitionFrames / CONFIG.ROUND_TRANSITION_FRAMES);
  }

  start(): void {
    this.session.start();
  }

  setCupX(x: number): void {
    this.session.setCupX(x);
  }

  get cupX(): number {
    return this.session.cupX;
  }

  /** HUDに出す数字。R1は積み上げた弾数、R2は最終スコア（意味が変わるのでラベルで示す） */
  get displayScore(): number {
    return this.session.score;
  }

  update(substeps: number): void {
    if (this.finished) return;

    // R1の後の演出中は盤面を進めない（下のバケツが下へ抜けていくのを見せる）
    if (this.transitioning) {
      this.transitionFrames++;
      if (this.transitionFrames < CONFIG.ROUND_TRANSITION_FRAMES) return;
      this.transitioning = false;
      this.round = 2;
      // ⚠️ ここで start() しない。R2もR1と同じく**タップされるまで待つ**（れいあ要望）。
      //    自動で始めると、コップの位置を選ぶ前に玉が落ち始めてしまう。
      return;
    }

    this.session.update(substeps);
    if (!this.session.finished) return;

    if (this.round === 1) {
      this.r1Score = this.session.score;
      // R2の盤面を作っておく（演出の間は止めたまま・演出明けに start する）
      // ⚠️ R2は別の盤面（れいあ要望）。ここで型ごと差し替わる
      this.session = new Session(buildStage(this.r2Def), {
        mode: 'r2',
        supplyTotal: Math.max(1, this.r1Score),
      });
      this.transitioning = true;
      this.transitionFrames = 0;
      return;
    }

    this.finalScore = this.session.score;
    this.finished = true;
  }
}
