import type { Session } from '../core/session';
import { sfx } from './sfx';

/**
 * ゲーム側の状態を毎フレーム見て、鳴らすべき音を決める。
 *
 * 🔑 **物理（`src/core/`）には音を持ち込まない**。core に `sfx.play()` を書くと、
 *    通しで何十回も回す採点の道具やテストがブラウザのAudio APIに依存してしまう
 *    （`tools/` は Node で走っている）。だから**外から状態の差分を見る**。
 * ⚠️ 個々のイベントは追えない（1フレームに何回増えたかしか分からない）が、
 *    どうせ間引くので十分。
 */
export class SfxWatch {
  private prevFlash = new Map<number, number>();
  private prevUsed = new Map<number, number>();
  private prevCollected = -1;

  /** ラウンドが変わったら基準を捨てる（⚠️ 残したままだと切り替えの瞬間に大量に鳴る） */
  reset(): void {
    this.prevFlash.clear();
    this.prevUsed.clear();
    this.prevCollected = -1;
  }

  tick(s: Session): void {
    // 玉が増えた（ゲートの光りが立ち上がった瞬間）。倍率で音程が変わる
    for (const g of s.stage.gates) {
      const now = g.flash ?? 0;
      const was = this.prevFlash.get(g.id) ?? 0;
      if (now > was) sfx.play('gate', g.multiplier);
      this.prevFlash.set(g.id, now);
    }

    // ジャンプ台で跳ねた。⚠️ 残り回数が減るほど低い音になる（台が疲れていく感じ）
    s.stage.jumpers.forEach((j, i) => {
      const was = this.prevUsed.get(i) ?? j.used;
      if (j.used > was) sfx.play('jump', j.capacity > 0 ? 1 - j.used / j.capacity : 0.5);
      this.prevUsed.set(i, j.used);
    });

    // 回収された。⚠️ 数千回鳴るので粒の連なりとして扱う（`sfx` 側で間引く）
    if (this.prevCollected >= 0 && s.collectedBalls > this.prevCollected) sfx.play('collect');
    this.prevCollected = s.collectedBalls;
  }
}
