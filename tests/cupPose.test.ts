import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { cupSpawnPosition, cupTiltPivot } from '../src/core/cupPose';

describe('上バケツの口の座標', () => {
  it('直立時は設定した口の位置から玉を出す', () => {
    const cupX = 180;
    expect(cupSpawnPosition(cupX, 0)).toEqual({
      x: cupX + CONFIG.CUP_SPAWN_OFFSET_X,
      y: CONFIG.CUP_Y + CONFIG.CUP_SPAWN_OFFSET_Y,
    });
  });

  it('Canvas と同じ時計回りの回転で口を動かす', () => {
    const cupX = 180;
    const pivot = cupTiltPivot(cupX, CONFIG.CUP_Y);
    const point = cupSpawnPosition(cupX, Math.PI / 2);
    const dx = CONFIG.CUP_SPAWN_OFFSET_X - CONFIG.CUP_TILT_PIVOT_OFFSET_X;
    const dy = CONFIG.CUP_SPAWN_OFFSET_Y - CONFIG.CUP_TILT_PIVOT_OFFSET_Y;

    // Canvas の +90度は (dx, dy) を (-dy, dx) にする。
    expect(point.x).toBeCloseTo(pivot.x - dy);
    expect(point.y).toBeCloseTo(pivot.y + dx);
  });
});
