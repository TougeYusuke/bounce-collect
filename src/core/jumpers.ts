import type { BallPool } from './ball';
import { wake } from './solver';
import type { Stage } from './stage';

/**
 * ジャンプ台の判定。
 *
 * ⚠️ ここが「必ず終わる」の唯一の保証。
 * 玉ごとの bounce に上限を設け、生まれた玉は親の bounce を引き継ぐ（gates.ts）。
 * これにより、玉がいくら増えても跳ね返りの総数は有限に収まる。
 *
 * 下から上への通過では反応しない。打ち上げた直後に同じ台で再点火してしまうため。
 */
export function applyJumpers(pool: BallPool, stage: Stage, maxBounce: number): void {
  pool.forEachActive((b) => {
    for (const j of stage.jumpers) {
      if (b.x < j.x1 || b.x > j.x2) continue;
      // 上から下へまたいだ時だけ反応する
      if (!(b.py <= j.y && b.y >= j.y)) continue;
      if (b.bounce >= maxBounce) continue;

      b.bounce++;
      b.y = j.y - 1;
      // Verlet では前フレーム位置を下にずらすことが上向きの速度になる
      b.py = b.y + j.power;
      wake(b);
      break; // 1フレームに複数の台で跳ねない
    }
  });
}
