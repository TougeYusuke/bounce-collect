import type { BallPool } from './ball';
import { isGateActive, type Gate, type Stage } from './stage';

/**
 * 玉が (px,py) から (x,y) に動く間にゲートを横切ったか。
 * 上下どちらの向きでも通過とみなす（ジャンプ台で跳ね上がる時の再通過のため）。
 */
export function crossedGate(
  _px: number,
  py: number,
  x: number,
  y: number,
  gate: Gate,
): boolean {
  if (x < gate.x1 || x > gate.x2) return false;
  const before = py - gate.y;
  const after = y - gate.y;
  if (before === 0 || after === 0) return true; // 線上ちょうどは通過扱い
  return before < 0 !== after < 0;
}

/**
 * 全ての玉にゲート通過を適用する。増えた総 weight を返す。
 *
 * ⚠️ ここがゲームの正体（設計書 §2.2）。2つの非対称を必ず守ること:
 *   - gateMask は生まれた玉ではリセット
 *     → 同じゲートをもう一度通ればまた増える＝指数爆発の源
 *   - bounce は生まれた玉へ継承
 *     → ジャンプ台の往復が必ず有限回で終わる＝勝手にラウンドが終わる
 * どちらか片方を外すと、増えないか永久に終わらないかのどちらかになる。
 */
export function applyGates(pool: BallPool, stage: Stage, maxBalls: number): number {
  let gained = 0;

  // 反復中に生まれた玉をその場で再判定しないよう、開始時点の玉だけを対象にする
  const snapshot: number[] = [];
  pool.forEachActive((_, i) => snapshot.push(i));

  for (const idx of snapshot) {
    const ball = pool.balls[idx];
    if (!ball.alive) continue;
    // ⚠️ 眠っている玉は判定しない。
    // 積もった玉がゲートの上に乗ると、微動でまたぐたびに増殖判定が走り、
    // 盤面が埋まるほど無限に増え続けてラウンドが終わらなくなる（実測）。
    // 止まっている玉はゲートを「通過」していないので、これが正しい挙動でもある。
    if (ball.sleeping) continue;

    for (const gate of stage.gates) {
      if (!isGateActive(gate)) continue; // 使い切ったゲートは素通り
      const bit = 1 << gate.id;
      if (ball.gateMask & bit) continue;
      if (!crossedGate(ball.px, ball.py, ball.x, ball.y, gate)) continue;

      gate.used += ball.weight;

      const extra = gate.multiplier - 1;
      const room = maxBalls - pool.activeCount;
      // ⚠️ weight を更新する前に計上すること（更新後だと増分が過大になる）
      gained += ball.weight * extra;

      if (room >= extra) {
        // 空きがある: 実際に玉を生む。生まれた玉は新品（gateMask = 0）
        ball.gateMask |= bit;
        const vx = ball.x - ball.px;
        const vy = ball.y - ball.py;
        for (let k = 0; k < extra; k++) {
          const child = pool.spawn(ball.x, ball.y, {
            weight: ball.weight,
            gateMask: 0, // ★新品（同じゲートをもう一度通れる）
            jumperMask: 0, // ★新品（ジャンプ台も使える）
            bounce: ball.bounce, // ★継承（跳ね返りの総数を有限に保つ）
          });
          if (!child) break;
          // 真上に重ねると押し合って弾け飛ぶので、決定論的に少しずらす
          child.x += ((k % 3) - 1) * 0.7;
          child.y += (k % 2) * 0.7;
          child.px = child.x - vx;
          child.py = child.y - vy;
        }
      } else {
        // 飽和: 玉を増やさず重さで表現する。
        // N個のうち N-1 個は新品なので多数決で新品扱いにし、
        // 通ったゲートの印だけ残す（残さないと同じゲートで無限に増える）
        ball.weight *= gate.multiplier;
        ball.gateMask = bit;
        ball.jumperMask = 0;
      }
    }
  }
  return gained;
}
