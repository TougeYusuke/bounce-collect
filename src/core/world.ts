import type { Ball } from './ball';

/** 壁・傾斜・仕切り板はすべて線分で表す。1種類の形だけ扱えば衝突判定も1つで済む */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface World {
  width: number;
  height: number;
  segments: Segment[];
}

export function closestPointOnSegment(
  px: number,
  py: number,
  seg: Segment,
): { x: number; y: number } {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: seg.x1, y: seg.y1 };
  let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: seg.x1 + t * dx, y: seg.y1 + t * dy };
}

/**
 * 玉が線分にめり込んでいたら押し出す。
 * restitution: 0 = 跳ねずに止まる / 1 = 完全に跳ね返る
 * 戻り値: 接触して押し出したか
 */
export function resolveSegmentCollision(
  ball: Ball,
  seg: Segment,
  radius: number,
  restitution: number,
): boolean {
  const c = closestPointOnSegment(ball.x, ball.y, seg);
  let nx = ball.x - c.x;
  let ny = ball.y - c.y;
  let dist = Math.hypot(nx, ny);
  if (dist >= radius) return false;

  // 完全に重なった場合は真上に逃がす（ゼロ除算回避）
  if (dist === 0) {
    nx = 0;
    ny = -1;
    dist = 0.0001;
  } else {
    nx /= dist;
    ny /= dist;
  }

  const push = radius - dist;
  ball.x += nx * push;
  ball.y += ny * push;

  // Verletでは「前フレーム位置」を動かすことで速度を操作する
  const vx = ball.x - ball.px;
  const vy = ball.y - ball.py;
  const vn = vx * nx + vy * ny; // 法線方向の速度成分
  if (vn < 0) {
    const tx = vx - vn * nx; // 接線成分は残す（面に沿って滑る）
    const ty = vy - vn * ny;
    const rx = tx - vn * nx * restitution;
    const ry = ty - vn * ny * restitution;
    ball.px = ball.x - rx;
    ball.py = ball.y - ry;
  }
  return true;
}

/** 盤面の左右端と底で玉を止める */
export function resolveBounds(
  ball: Ball,
  world: World,
  radius: number,
  restitution: number,
): void {
  if (ball.x < radius) {
    ball.x = radius;
    const vx = ball.x - ball.px;
    if (vx < 0) ball.px = ball.x + vx * restitution;
  } else if (ball.x > world.width - radius) {
    ball.x = world.width - radius;
    const vx = ball.x - ball.px;
    if (vx > 0) ball.px = ball.x + vx * restitution;
  }
  if (ball.y > world.height - radius) {
    ball.y = world.height - radius;
    const vy = ball.y - ball.py;
    if (vy > 0) ball.py = ball.y + vy * restitution;
  }
}
