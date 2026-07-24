/** スコア表示。DOM を触るのはここだけに閉じ込める（結果画面は screens.ts が持つ） */
export class Hud {
  private scoreEl = document.getElementById('score')!;
  private labelEl = document.getElementById('score-label')!;
  private shown = -1;
  private label = '';

  setScore(v: number): void {
    // 毎フレーム textContent を書き換えると無駄なので、変わった時だけ
    if (v === this.shown) return;
    this.shown = v;
    this.scoreEl.textContent = v.toLocaleString('ja-JP');
  }

  /** R1は「BALLS」（積み上げた弾）、R2は「SCORE」（最終スコア）。数字の意味が変わるため */
  setLabel(v: string): void {
    if (v === this.label) return;
    this.label = v;
    this.labelEl.textContent = v;
  }
}
