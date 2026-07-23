import { CONFIG } from './config';
import type { Gate, Stage } from './stage';

export type DebugPreset = 'single-gate' | 'gate-jumper' | 'two-gates';

function gate(
  id: number,
  x1: number,
  x2: number,
  y: number,
  multiplier: number,
  capacity: number,
): Gate {
  return { id, x1, x2, y, multiplier, capacity, used: 0 };
}

/**
 * 挙動を1個ずつ確かめるための最小ステージ。
 * 本番のステージは要素が多すぎて、どの仕掛けが何をしたのか切り分けられない。
 */
export function createDebugStage(preset: DebugPreset): Stage {
  const w = CONFIG.BOARD_WIDTH;
  const h = CONFIG.BOARD_HEIGHT;

  if (preset === 'single-gate') {
    return {
      segments: [],
      gates: [gate(0, w * 0.15, w * 0.85, 260, 2, 1e9)],
      jumpers: [],
      collectY: h - 20,
    };
  }

  if (preset === 'two-gates') {
    return {
      segments: [],
      gates: [
        gate(0, w * 0.15, w * 0.85, 220, 2, 1e9),
        gate(1, w * 0.15, w * 0.85, 400, 2, 1e9),
      ],
      jumpers: [],
      collectY: h - 20,
    };
  }

  // gate-jumper: ゲート1つ + その下にジャンプ台（本番と同じ高低差にする）
  return {
    segments: [],
    gates: [gate(0, w * 0.15, w * 0.85, 200, 2, 1e9)],
    jumpers: [{ id: 0, x1: w * 0.2, x2: w * 0.8, y: 520, power: CONFIG.JUMP_POWER }],
    collectY: h - 20,
  };
}
