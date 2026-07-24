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

  constructor() {
    this.session = new Session();
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
    this.session.update(substeps);
    if (!this.session.finished) return;

    if (this.round === 1) {
      this.r1Score = this.session.score;
      // ⚠️ 必ず新しい Stage を作る。使い回すとR1で使い切ったゲートの capacity が
      //    尽きたままになり、R2で全部素通りになる
      this.session = new Session(createFixedStage(), {
        mode: 'r2',
        supplyTotal: Math.max(1, this.r1Score),
      });
      this.round = 2;
      this.session.start(); // シームレスに続ける（タップを待たない）
      return;
    }

    this.finalScore = this.session.score;
    this.finished = true;
  }
}
