/** スコア表示と結果画面。DOM を触るのはここだけに閉じ込める */
export class Hud {
  private scoreEl = document.getElementById('score')!;
  private overlay = document.getElementById('result') as HTMLDivElement;
  private finalEl = document.getElementById('final-score')!;
  private shown = -1;

  setScore(v: number): void {
    // 毎フレーム textContent を書き換えると無駄なので、変わった時だけ
    if (v === this.shown) return;
    this.shown = v;
    this.scoreEl.textContent = v.toLocaleString('ja-JP');
  }

  showResult(v: number): void {
    this.finalEl.textContent = v.toLocaleString('ja-JP');
    this.overlay.hidden = false;
  }

  hideResult(): void {
    this.overlay.hidden = true;
    this.shown = -1;
  }
}
