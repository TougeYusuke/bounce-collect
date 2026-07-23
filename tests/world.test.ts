import { describe, it, expect } from 'vitest';
import { closestPointOnSegment, resolveSegmentCollision, resolveBounds } from '../src/core/world';
import type { Ball } from '../src/core/ball';

function makeBall(x: number, y: number): Ball {
  return {
    x, y, px: x, py: y,
    weight: 1, gateMask: 0, jumperMask: 0, bounce: 0, flying: false, anchorX: x, anchorY: y,
    sleepFrames: 0, sleeping: false, alive: true, index: 0,
  };
}

describe('closestPointOnSegment', () => {
  it('線分の真ん中に垂線が下りる場合', () => {
    const p = closestPointOnSegment(50, 10, { x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
  });

  it('線分の外側なら端点にクランプされる', () => {
    const p = closestPointOnSegment(-30, 10, { x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('長さゼロの線分でもクラッシュしない', () => {
    const p = closestPointOnSegment(10, 10, { x1: 5, y1: 5, x2: 5, y2: 5 });
    expect(p.x).toBe(5);
    expect(p.y).toBe(5);
  });
});

describe('resolveSegmentCollision', () => {
  it('線分にめり込んだ玉を押し出す', () => {
    const seg = { x1: 0, y1: 100, x2: 200, y2: 100 };
    const b = makeBall(50, 97); // 半径5なので3だけめり込んでいる
    resolveSegmentCollision(b, seg, 5, 0);
    expect(b.y).toBeCloseTo(95); // 線分の上側に半径ぶん出る
  });

  it('触れていない玉は動かさない', () => {
    const seg = { x1: 0, y1: 100, x2: 200, y2: 100 };
    const b = makeBall(50, 50);
    const moved = resolveSegmentCollision(b, seg, 5, 0);
    expect(moved).toBe(false);
    expect(b.y).toBe(50);
  });

  it('restitution 0 なら跳ね返らない（法線方向の速度が消える）', () => {
    const seg = { x1: 0, y1: 100, x2: 200, y2: 100 };
    const b = makeBall(50, 97);
    b.py = 90; // 下向きに落ちてきた
    resolveSegmentCollision(b, seg, 5, 0);
    expect(b.py).toBeCloseTo(b.y);
  });

  it('斜めの線分では接線方向に滑る（横速度が残る）', () => {
    const seg = { x1: 0, y1: 0, x2: 100, y2: 100 }; // 45度
    const b = makeBall(48, 52); // 線分の左上側にわずかにめり込む
    b.px = 48;
    b.py = 42; // 下向きに落ちてきた
    resolveSegmentCollision(b, seg, 5, 0);
    const vx = b.x - b.px;
    expect(Math.abs(vx)).toBeGreaterThan(0); // 真下に止まらず横に流れる
  });

  it('完全に線分上に重なってもクラッシュしない', () => {
    const seg = { x1: 0, y1: 100, x2: 200, y2: 100 };
    const b = makeBall(50, 100);
    expect(() => resolveSegmentCollision(b, seg, 5, 0)).not.toThrow();
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});

describe('resolveBounds', () => {
  const world = { width: 200, height: 300, segments: [] };

  it('左端を越えない', () => {
    const b = makeBall(1, 50);
    resolveBounds(b, world, 5, 0);
    expect(b.x).toBe(5);
  });

  it('右端を越えない', () => {
    const b = makeBall(199, 50);
    resolveBounds(b, world, 5, 0);
    expect(b.x).toBe(195);
  });

  it('底を抜けない', () => {
    const b = makeBall(50, 299);
    resolveBounds(b, world, 5, 0);
    expect(b.y).toBe(295);
  });

  it('天井を抜けない（ジャンプ台で上に飛ぶため必要）', () => {
    const b = makeBall(50, 1);
    resolveBounds(b, world, 5, 0);
    expect(b.y).toBe(5);
  });

  it('内側にいる玉は動かさない', () => {
    const b = makeBall(100, 150);
    resolveBounds(b, world, 5, 0);
    expect(b.x).toBe(100);
    expect(b.y).toBe(150);
  });
});
