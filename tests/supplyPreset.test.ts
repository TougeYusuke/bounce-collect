import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  DEFAULT_SUPPLY_KEY,
  SUPPLY_PRESETS,
  applySupplyPreset,
  resolveSupplyKey,
  supplyPreset,
} from '../src/core/supplyPreset';

/**
 * 盛り上がりの実験プリセットの見張り。
 *
 * ⚠️ ここを見張る理由＝**2026-07-25 に「ツマミが効かない」を誤診した**実績があるため
 *    （`STEP_OPTIONS` をモジュール読み込み時に1回だけ作っていて、振っても結果が1bitも変わらなかった）。
 *    「当てたのに変わらない」を、実機で気づく前にここで落とす。
 */

/** ⚠️ 書き換える前の値を先に取る（このファイルの中でしか CONFIG を触らない前提） */
const ORIGINAL = {
  OUTLET_BALLS: CONFIG.OUTLET_BALLS,
  GATE_SPAWN_CLEARANCE: CONFIG.GATE_SPAWN_CLEARANCE,
  MAX_PUSH_UPS: CONFIG.MAX_PUSH_UPS,
  SPAWN_GROW_FRAMES: CONFIG.SPAWN_GROW_FRAMES,
};

function restore(): void {
  const c = CONFIG as unknown as Record<string, number>;
  c.OUTLET_BALLS = ORIGINAL.OUTLET_BALLS;
  c.GATE_SPAWN_CLEARANCE = ORIGINAL.GATE_SPAWN_CLEARANCE;
  c.MAX_PUSH_UPS = ORIGINAL.MAX_PUSH_UPS;
  c.SPAWN_GROW_FRAMES = ORIGINAL.SPAWN_GROW_FRAMES;
}

afterEach(restore);

describe('盛り上がりの実験プリセット', () => {
  it('既定（いま）は本番の設定と一致する＝比較の基準がズレていない', () => {
    const a = supplyPreset(DEFAULT_SUPPLY_KEY);
    expect(a.outlet).toBe(ORIGINAL.OUTLET_BALLS);
    expect(a.clearance).toBe(ORIGINAL.GATE_SPAWN_CLEARANCE);
    expect(a.pushUps).toBe(ORIGINAL.MAX_PUSH_UPS);
    expect(a.grow).toBe(ORIGINAL.SPAWN_GROW_FRAMES);
  });

  it('当てると CONFIG が実際に変わる（効かない誤診の防止）', () => {
    for (const p of SUPPLY_PRESETS) {
      applySupplyPreset(p.key);
      expect(CONFIG.OUTLET_BALLS, p.name).toBe(p.outlet);
      expect(CONFIG.GATE_SPAWN_CLEARANCE, p.name).toBe(p.clearance);
      expect(CONFIG.MAX_PUSH_UPS, p.name).toBe(p.pushUps);
      expect(CONFIG.SPAWN_GROW_FRAMES, p.name).toBe(p.grow);
    }
  });

  it('知らないキー・空・null は既定に落ちる（保存を信じない）', () => {
    expect(resolveSupplyKey(null)).toBe(DEFAULT_SUPPLY_KEY);
    expect(resolveSupplyKey('')).toBe(DEFAULT_SUPPLY_KEY);
    expect(resolveSupplyKey('zzz')).toBe(DEFAULT_SUPPLY_KEY);
  });

  it('⚠️ 玉を生む間隔は 0.5 を下回らない（0.45 で暴走を実測済み）', () => {
    for (const p of SUPPLY_PRESETS) expect(p.clearance, p.name).toBeGreaterThanOrEqual(0.5);
  });

  it('3案は互いに別の設定になっている（同じものを並べていない）', () => {
    const seen = new Set(SUPPLY_PRESETS.map((p) => `${p.outlet}/${p.clearance}/${p.pushUps}/${p.grow}`));
    expect(seen.size).toBe(SUPPLY_PRESETS.length);
  });
});
