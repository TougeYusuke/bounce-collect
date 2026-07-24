import { CONFIG } from './config';
import type { BallPool } from './ball';
import { type Gate, type Stage } from './stage';

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
 * 全ての玉にゲート通過を適用する。実際に増えた玉の数を返す。
 *
 * ⚠️ ここがゲームの正体（設計書 §2.2）。2つの非対称を必ず守ること:
 *   - gateMask は生まれた玉ではリセット
 *     → 同じゲートをもう一度通ればまた増える＝指数爆発の源
 *   - bounce は生まれた玉へ継承
 *     → ジャンプ台の往復が必ず有限回で終わる＝勝手にラウンドが終わる
 * どちらか片方を外すと、増えないか永久に終わらないかのどちらかになる。
 *
 * ⚠️ **盤面が満杯なら増えない**（2026-07-24 れいあ裁定）。
 *    以前は満杯時に「1個の玉の中身（weight）を倍にする」ことで増殖を続けていたが、
 *    それが「1個回収するたびに数千点入る」の正体だった。
 *    スコアは**回収した玉の個数**なので、盤面に入らなかった玉は存在しない。
 */
/** 0以上1未満の決定論的な値。乱数の代わりに使う（同じ入力なら必ず同じ結果） */
export function hash01(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x / 4294967296;
}

export function applyGates(
  pool: BallPool,
  stage: Stage,
  maxBalls: number,
  ballDiameter = 10,
  grid?: { forEachNeighbor(x: number, y: number, fn: (i: number) => void): void },
): number {
  let gained = 0;

  /**
   * その場所が既に埋まっているか。
   * ⚠️ 埋まっているのに生やすと、生まれた瞬間から玉が重なって押し出され、
   *    弾かれた玉が上へ飛ぶ（設計書2026-07-23 §10.2 が「ガード必須」と書いていたのに
   *    未実装だった・れいあ指摘）。混んでいる場所には**そもそも生まない**。
   */
  const occupied = (x: number, y: number): boolean => {
    if (!grid) return false;
    const minSq = (ballDiameter * 0.85) ** 2;
    let hit = false;
    grid.forEachNeighbor(x, y, (i) => {
      if (hit) return;
      const o = pool.balls[i];
      if (!o.alive) return;
      const dx = o.x - x;
      const dy = o.y - y;
      if (dx * dx + dy * dy < minSq) hit = true;
    });
    return hit;
  };

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

    // ⚠️ 減速はゲートを全部見終わってから掛ける。ループの中で px/py を書き換えると、
    //    同じフレームで次のゲートを「またいでいない」と誤判定する（実測で発覚）。
    let slowDown = false;

    for (const gate of stage.gates) {
      // 1つの玉につき1回だけ反応する（使用回数の上限は持たない・2026-07-24）
      const bit = 1 << gate.id;
      if (ball.gateMask & bit) continue;
      if (!crossedGate(ball.px, ball.py, ball.x, ball.y, gate)) continue;

      const extra = gate.multiplier - 1;
      gained += ball.weight * extra;

      {
        // 盤面に入るぶんだけ実際に玉を生む。生まれた玉は新品（gateMask = 0）。
        // ⚠️ 盤面が満杯なら**何も起きない**（以前はここで重さを倍にしていた）
        ball.gateMask |= bit;
        slowDown = true;

        // ⚠️ 生まれた玉を上へ飛ばさない（れいあ指摘）。
        //    親が上向きに弾かれている瞬間にゲートを通ると、子まで上へ打ち上がって
        //    上のゲートを再走し、増殖が止まらなくなる。見た目にも不自然。
        //    ただしジャンプ台で上昇中（flying）は意図した上昇なのでそのまま継がせる。
        const rawVy = ball.y - ball.py;
        const vy = ball.flying ? rawVy : Math.max(0, rawVy);

        // ⚠️ 分身は**元の玉の位置から湧かせる**（れいあ指定 2026-07-24）。
        //    真上には出さず、親のまわりの下半分へわずかにずらして置く。
        //    ⚠️ 昔「親と同じ場所に重ねると押し出しで弾け飛ぶ」という指摘があったが、
        //       いまは当たり判定を小さく生む＋混雑チェック＋横に散らす初速で抑えている。
        const radius = ballDiameter / 2;
        const offset = radius * CONFIG.SPAWN_OFFSET;

        let placed = 0;
        for (let k = 0; k < extra; k++) {
          if (pool.activeCount >= maxBalls) break; // 盤面が満杯ならこれ以上は増えない
          // ⚠️ 乱数は使わない（設計書 §4.4）。同じ状況なら同じ結果になるよう、
          //    玉と順番から決定論的に散らす。角度は 0〜π ＝ 下半分だけ（上には湧かせない）。
          // 下半分（0〜π）に等間隔で並べ、そこへ決定論的な揺らぎを少し足す。
          // ⚠️ 完全にランダムな角度にすると兄弟が近づいて互いに生成を弾く。
          const jitter = hash01(idx * 2654435761 + k * 40503 + gate.id * 97) - 0.5;
          const ang = (Math.PI * (k + 0.5 + jitter * 0.6)) / extra;
          const cx = ball.x + Math.cos(ang) * offset;
          const cy = ball.y + Math.sin(ang) * offset;
          if (occupied(cx, cy)) continue; // 混んでいる場所には生まない
          const child = pool.spawn(cx, cy, {
            weight: ball.weight,
            // ⚠️ 小さく生む。フル半径だと密集地帯で既存の玉を強く押し出し、
            //    弾かれた玉が上へ飛んで上のゲートを再走する（れいあ指摘）
            grow: CONFIG.SPAWN_GROW_START,
            gateMask: 0, // ★新品（別のゲートでまた増える）
            jumperMask: 0, // ★新品（ジャンプ台も使える）
            bounce: ball.bounce, // ★継承（跳ね返りの総数を有限に保つ）
            flying: ball.flying, // ★継承（上昇中に増えた玉も叩き落されない）
          });
          if (!child) break;
          if (ball.flying) {
            // 上昇中の親から生まれた子は、そのまま上向きの勢いを継ぐ（跳ね上げの演出）
            child.px = child.x;
            child.py = child.y - vy;
          } else {
            // ⚠️ 下方向へ、向きだけ散らす（れいあ指定）。上向きには**しない**。
            const sx = (hash01(idx * 7919 + k * 104729 + gate.id * 31) * 2 - 1) *
              CONFIG.SPAWN_SPREAD_X;
            const sy = CONFIG.SPAWN_DROP_SPEED *
              (0.5 + hash01(idx * 15485863 + k * 3 + gate.id * 7) * 0.5);
            child.px = child.x - sx;
            child.py = child.y - sy;
          }
          placed++;
        }
        // ⚠️ 置けなかったぶんは**そのまま増えない**。
        //    スコアは「回収した玉の個数」なので、盤面に入らなかった玉は存在しない
        //    （以前は親の重さに足していたが、それが「1個で数千点」の正体だった）
        gained -= ball.weight * (extra - placed);
      }
    }

    // 水面に入ったように一度勢いを落とす（れいあ提案）。
    // ⚠️ 上昇中（ジャンプ台で打ち上げ中）は勢いを殺さない＝跳ね上げの意味が消えるため。
    if (slowDown && !ball.flying) {
      const drag = CONFIG.GATE_DRAG;
      ball.px = ball.x - (ball.x - ball.px) * drag;
      ball.py = ball.y - (ball.y - ball.py) * drag;
    }
  }
  return gained;
}
