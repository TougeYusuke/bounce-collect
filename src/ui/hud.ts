/** スコア表示。DOM を触るのはここだけに閉じ込める（結果画面は screens.ts が持つ） */
export class Hud {
  private scoreEl = document.getElementById('score')!;
  private shown = -1;

  setScore(v: number): void {
    // 毎フレーム textContent を書き換えると無駄なので、変わった時だけ
    if (v === this.shown) return;
    this.shown = v;
    this.scoreEl.textContent = v.toLocaleString('ja-JP');
  }
}
