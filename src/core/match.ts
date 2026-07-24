import { CONFIG } from './config';
import { Session } from './session';
import { createFixedStage } from './stage';

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

  constructor() {
    this.session = new Session();
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
      this.session.start(); // ここからR2（供給には別途の待ちがある）
      return;
    }

    this.session.update(substeps);
    if (!this.session.finished) return;

    if (this.round === 1) {
      this.r1Score = this.session.score;
      // R2の盤面を作っておく（演出の間は止めたまま・演出明けに start する）
      this.session = new Session(createFixedStage(), {
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
