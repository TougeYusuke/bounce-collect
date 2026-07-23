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
export function applyGates(
  pool: BallPool,
  stage: Stage,
  maxBalls: number,
  ballDiameter = 10,
): number {
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

        // ⚠️ 子を親と同じ場所に重ねて生むと、玉同士の押し出しで左右に弾け飛び、
        // 落下の軌道が不自然になる（れいあ指摘）。
        // 進行方向に沿って一列に並べれば、重ならず、横にも散らない。
        const len = Math.hypot(vx, vy);
        const ux = len > 0.01 ? vx / len : 0;
        const uy = len > 0.01 ? vy / len : 1; // 止まっていれば下向きとみなす
        const spacing = ballDiameter;

        for (let k = 0; k < extra; k++) {
          // 進行方向の「前」に並べる。後ろ（通ってきた側）に置くと、
          // 次のフレームで同じゲートをもう一度またいでしまう。
          const d = spacing * (k + 1);
          // ⚠️ 完全な一直線にしないこと。真っ直ぐ並べると、細い仕切りの上などに
          // そのまま縦に積み上がって崩れず、眠って固まってしまう（実測）。
          // 進行方向に対して垂直に、交互にわずかずらして不安定にする。
          const jitter = (k % 2 === 0 ? 1 : -1) * spacing * 0.15;
          const child = pool.spawn(ball.x + ux * d - uy * jitter, ball.y + uy * d + ux * jitter, {
            weight: ball.weight,
            gateMask: 0, // ★新品（別のゲートでまた増える）
            jumperMask: 0, // ★新品（ジャンプ台も使える）
            bounce: ball.bounce, // ★継承（跳ね返りの総数を有限に保つ）
          });
          if (!child) break;
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
