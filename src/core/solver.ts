import type { Ball, BallPool } from './ball';
import type { SpatialGrid } from './grid';
import type { World } from './world';
import { resolveBounds, resolveSegmentCollision } from './world';

/** 上向きに飛ぶ時だけ終端速度を何倍まで許すか（ジャンプ台の打ち上げ用） */
const UPWARD_SPEED_ALLOWANCE = 6;

/**
 * Verlet積分。速度は「現在位置 - 前フレーム位置」で暗黙に表される。
 *
 * 速度の上限は必須。1フレームの移動量が玉の半径に近づくと、位置補正が追いつかず
 * 玉同士が深くめり込んだまま抜けられなくなる（積もった山が潰れて破綻する）。
 *
 * ⚠️ 上限は「速度の大きさ」ではなく **軸ごとに独立して** かけること。
 * 大きさでかけると、落下が速くなるほど横方向の速度まで巻き添えで削られ、
 * 玉が途中から真下にしか落ちなくなって動きが不自然になる（れいあ指摘・実測）。
 *
 * ⚠️ 上向きだけは上限を緩める。落下と同じ上限だとジャンプ台で打ち上げても
 * 20px ほどしか上がらず、上のゲートに永久に届かない。
 * 上方向には積もった玉が無く、すり抜けても実害が小さいのでここだけ許容する。
 */
export function integrate(
  ball: Ball,
  gravity: number,
  damping: number,
  maxSpeed: number,
): void {
  let vx = (ball.x - ball.px) * damping;
  let vy = (ball.y - ball.py) * damping + gravity;

  // 横: 左右対称に制限（落下速度の影響を受けない）
  if (vx > maxSpeed) vx = maxSpeed;
  else if (vx < -maxSpeed) vx = -maxSpeed;

  // 縦: 落ちる側は厳しく、上がる側は緩く
  const upLimit = maxSpeed * UPWARD_SPEED_ALLOWANCE;
  if (vy > maxSpeed) vy = maxSpeed;
  else if (vy < -upLimit) vy = -upLimit;

  ball.px = ball.x;
  ball.py = ball.y;
  ball.x += vx;
  ball.y += vy;
}

/** 眠っている玉を起こすのに必要なめり込みの深さ（直径に対する割合） */
const WAKE_OVERLAP_RATIO = 0.12;

export function wake(ball: Ball): void {
  ball.sleeping = false;
  ball.sleepFrames = 0;
  ball.anchorX = ball.x;
  ball.anchorY = ball.y;
}

/** 玉同士の重なりを位置補正で解消する（反復するほど安定するが重くなる） */
export function resolveBallCollisions(
  pool: BallPool,
  grid: SpatialGrid,
  radius: number,
  iterations: number,
): void {
  const d = radius * 2;
  const dSq = d * d;

  // 下にある玉から順に解く。
  // 積もった山では下の玉が上の玉を支えるので、支える側から確定させないと
  // 圧力が上まで伝わらず、山が潰れたまま抜け出せなくなる（Gauss-Seidel の順序効果）。
  const order: number[] = [];
  pool.forEachActive((_, i) => order.push(i));
  order.sort((i, j) => pool.balls[j].y - pool.balls[i].y);

  for (let iter = 0; iter < iterations; iter++) {
    grid.clear();
    pool.forEachActive((b, i) => grid.insert(i, b.x, b.y));

    for (let oi = 0; oi < order.length; oi++) {
      const ai = order[oi];
      const a = pool.balls[ai];
      if (!a.alive) continue;
      grid.forEachNeighbor(a.x, a.y, (bi) => {
        if (bi <= ai) return; // 同じペアを2回処理しない
        const b = pool.balls[bi];
        if (!b.alive) return;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= dSq) return;

        // 打ち上げ中の玉はすり抜ける。上に向かって飛んでいる玉が
        // 落ちてくる玉に当たって叩き落されるのを防ぐ（壁と床には当たる）。
        if (a.flying || b.flying) return;

        let dist = Math.sqrt(distSq);

        // 眠っている玉同士: 原則そのまま（積もった山として固定する）。
        // ただし深く食い込んだまま眠ると山が潰れて見えるので、そこだけは直す。
        // px/py も同じだけ動かすことで、速度を生まずに位置だけ整えて眠り続けさせる。
        if (a.sleeping && b.sleeping) {
          if (dist > d * 0.98 || dist === 0) return;
          const fix = (d - dist) * 0.5;
          const fx = (dx / dist) * fix;
          const fy = (dy / dist) * fix;
          a.x -= fx;
          a.y -= fy;
          a.px -= fx;
          a.py -= fy;
          b.x += fx;
          b.y += fy;
          b.px += fx;
          b.py += fy;
          return;
        }

        if (dist === 0) {
          // 完全に重なったら決定論的にずらす（乱数を使わない = 再現性のため）
          dx = ai % 2 === 0 ? 0.01 : -0.01;
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const overlap = (d - dist) * 0.5;
        const nx = (dx / dist) * overlap;
        const ny = (dy / dist) * overlap;

        // 深くめり込んだ時だけ眠りを破る。
        // 軽く触れただけで起こすと、密集した山では連鎖的に起こし合って誰も眠れない。
        const deepHit = d - dist > d * WAKE_OVERLAP_RATIO;

        // 位置だけを戻し、px/py は動かさない。
        // Verlet では「戻した量」がそのまま減速として効く（px も動かすと重力ぶんの
        // 速度が毎フレーム蓄積して、山が静止しているのに速度だけ膨らむ）。
        if (a.sleeping) {
          b.x += nx * 2;
          b.y += ny * 2;
          if (deepHit) wake(a);
          return;
        }
        if (b.sleeping) {
          a.x -= nx * 2;
          a.y -= ny * 2;
          if (deepHit) wake(b);
          return;
        }
        a.x -= nx;
        a.y -= ny;
        b.x += nx;
        b.y += ny;
        cancelNormalVelocity(a, b, dx / dist, dy / dist);
      });
    }
  }
}

/**
 * 2つの玉の「近づく向きの相対速度」を打ち消す（完全非弾性＝玉同士は跳ねない）。
 *
 * これが無いと、位置を押し戻すだけで速度が残り、積もった山が永久に微振動して
 * いつまでも眠らない。位置補正と速度補正はセットで初めて安定する。
 * u は a から b へ向かう単位ベクトル。
 */
function cancelNormalVelocity(a: Ball, b: Ball, ux: number, uy: number): void {
  const avx = a.x - a.px;
  const avy = a.y - a.py;
  const bvx = b.x - b.px;
  const bvy = b.y - b.py;
  const rvn = (bvx - avx) * ux + (bvy - avy) * uy;
  if (rvn >= 0) return; // 離れつつあるなら触らない
  const half = rvn * 0.5;
  if (!a.sleeping) {
    a.px -= ux * half;
    a.py -= uy * half;
  }
  if (!b.sleeping) {
    b.px += ux * half;
    b.py += uy * half;
  }
}

/**
 * 動かなくなった玉を眠らせる。眠った玉は積分をスキップできる。
 *
 * ⚠️ 判定は「速度」ではなく「一定フレームの間に実際どれだけ動いたか」で行う。
 * 速度（現在位置 - 前フレーム位置）は玉同士の押し出し補正でブレるため、
 * 斜面をゆっくり滑っている玉まで静止と誤判定して固めてしまい、
 * 斜面の途中に玉が張り付いたまま止まる（れいあ指摘の「おかしな止まり方」）。
 *
 * velocityThreshold は「1フレームあたりの許容移動量」として扱う
 * （framesToSleep 倍したものを、その間の移動距離のしきい値にする）。
 */
export function updateSleep(
  ball: Ball,
  velocityThreshold: number,
  framesToSleep: number,
): void {
  ball.sleepFrames++;
  if (ball.sleepFrames < framesToSleep) return;

  const moved = Math.hypot(ball.x - ball.anchorX, ball.y - ball.anchorY);
  if (moved < velocityThreshold * framesToSleep) {
    ball.sleeping = true;
    ball.px = ball.x; // 速度を完全に消す
    ball.py = ball.y;
  }
  // 次の観測期間へ
  ball.anchorX = ball.x;
  ball.anchorY = ball.y;
  ball.sleepFrames = 0;
}

export interface StepOptions {
  gravity: number;
  damping: number;
  radius: number;
  maxSpeed: number;
  restitution: number;
  iterations: number;
  sleepVelocity: number;
  sleepFrames: number;
}

/**
 * 1ステップぶんの物理を進める。
 *
 * ⚠️ 順序が重要: 静的形状との衝突は「玉同士の押し出しより後」に置くこと。
 * 先に壁でクランプしても、そのあと玉同士が押し合えば簡単に壁を突き抜ける。
 * 最後に壁で締めることで、めり込みを毎フレーム確実に戻せる。
 */
export function step(
  pool: BallPool,
  grid: SpatialGrid,
  world: World,
  opts: StepOptions,
): void {
  // 1. 積分（重力を受けて動く）
  pool.forEachActive((b) => {
    if (b.sleeping) return;
    integrate(b, opts.gravity, opts.damping, opts.maxSpeed);
    // 頂点を過ぎて落ち始めたら、すり抜けを解除して普通の玉に戻す
    if (b.flying && b.y >= b.py) b.flying = false;
  });

  // 2. 玉同士の重なりを解消
  resolveBallCollisions(pool, grid, opts.radius, opts.iterations);

  // 3. 静的形状と盤面境界で締める
  pool.forEachActive((b) => {
    // 盤面の四辺は眠っている玉にもかける。
    // 眠り玉同士のめり込み補正で壁の外へ押し出されることがあり、
    // スキップすると少しずつ盤面からはみ出す。境界チェックだけなので軽い。
    if (b.sleeping) {
      resolveBounds(b, world, opts.radius, 0);
      return;
    }
    for (let s = 0; s < world.segments.length; s++) {
      resolveSegmentCollision(b, world.segments[s], opts.radius, opts.restitution);
    }
    resolveBounds(b, world, opts.radius, opts.restitution);
  });

  // 4. 静止した玉を眠らせる
  pool.forEachActive((b) => {
    if (b.sleeping) return;
    updateSleep(b, opts.sleepVelocity, opts.sleepFrames);
  });
}
