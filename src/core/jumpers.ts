import type { BallPool } from './ball';
import { wake } from './solver';
import type { Stage } from './stage';

/**
 * ジャンプ台の判定。
 *
 * ⚠️ 「必ず終わる」の保証が二重にかかっている:
 *   1. 1つの台は1つの玉につき1回だけ反応する（ゲートと同じ jumperMask）
 *   2. 玉ごとの bounce に上限がある（生まれた玉は親の bounce を継承する）
 * 1 だけだと、増えた玉が新品として何度でも跳ねられる。2 だけだと同じ台で
 * 何度も跳ね続ける。両方あって初めて確実に収束する。
 *
 * 下から上への通過では反応しない。打ち上げた直後に同じ台で再点火してしまうため。
 */
export function applyJumpers(pool: BallPool, stage: Stage, maxBounce: number): void {
  pool.forEachActive((b) => {
    for (const j of stage.jumpers) {
      const bit = 1 << j.id;
      if (b.jumperMask & bit) continue; // この台はもう使った
      if (b.x < j.x1 || b.x > j.x2) continue;
      // 上から下へまたいだ時だけ反応する
      if (!(b.py <= j.y && b.y >= j.y)) continue;
      if (b.bounce >= maxBounce) continue;

      b.jumperMask |= bit;
      b.bounce++;
      b.y = j.y - 1;
      // Verlet では前フレーム位置を下にずらすことが上向きの速度になる
      b.py = b.y + j.power;
      wake(b);
      break; // 1フレームに複数の台で跳ねない
    }
  });
}
