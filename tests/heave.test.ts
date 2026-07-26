import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import type { Gate } from '../src/core/stage';
import { heaveLift } from '../src/render/heave';

/**
 * 「隆起」（増えた瞬間に山が持ち上がって見える演出）の見張り。
 *
 * ⚠️ ここを見張る理由＝**2026-07-25 に「ツマミが効かない」を誤診した**実績があるため。
 *    「入れたのに何も起きない」を、れいあが実機で気づく前にここで落とす。
 * ⚠️ これは**描画上のオフセットだけ**。物理・当たり判定・ステージの採点には一切関係しない。
 */

const gate = (over: Partial<Gate> = {}): Gate => ({
  id: 0,
  x1: 100,
  x2: 200,
  y: 300,
  multiplier: 2,
  flash: CONFIG.GATE_FLASH_FRAMES,
  // ⚠️ 隆起が見るのは `heave`（光りの `flash` ではない）。共用に戻すと
  //    「動きを長くしたら光りまで伸びた」に逆戻りする（れいあ判定 2026-07-26）
  heave: CONFIG.GATE_HEAVE_FRAMES,
  ...over,
});

const ORIGINAL = CONFIG.GATE_HEAVE_VISUAL;
afterEach(() => {
  (CONFIG as unknown as Record<string, number>).GATE_HEAVE_VISUAL = ORIGINAL;
});

describe('隆起（描画だけの持ち上げ）', () => {
  it('光っているゲートの真上は持ち上がる', () => {
    // ゲートのすぐ上（1px）＝ほぼ最大まで持ち上がる
    expect(heaveLift([gate()], 150, 299)).toBeGreaterThan(CONFIG.GATE_HEAVE_VISUAL * 0.9);
  });

  it('ゲートから離れるほど小さくなり、届く距離の外では0', () => {
    const near = heaveLift([gate()], 150, 300 - 10);
    const far = heaveLift([gate()], 150, 300 - 40);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(heaveLift([gate()], 150, 300 - CONFIG.GATE_HEAVE_VISUAL_RANGE - 1)).toBe(0);
  });

  it('ゲートより下の玉は持ち上げない（山ごと浮かせない）', () => {
    expect(heaveLift([gate()], 150, 301)).toBe(0);
  });

  it('ゲートの横幅の外は持ち上げない', () => {
    expect(heaveLift([gate()], 99, 299)).toBe(0);
    expect(heaveLift([gate()], 201, 299)).toBe(0);
  });

  it('時間が経つ（heaveが減る）と戻る', () => {
    const full = heaveLift([gate({ heave: CONFIG.GATE_HEAVE_FRAMES })], 150, 299);
    const half = heaveLift([gate({ heave: CONFIG.GATE_HEAVE_FRAMES / 2 })], 150, 299);
    expect(half).toBeLessThan(full);
    expect(heaveLift([gate({ heave: 0 })], 150, 299)).toBe(0);
    expect(heaveLift([gate({ heave: undefined })], 150, 299)).toBe(0);
  });

  it('⚠️ 光り（flash）ではなく heave を見る＝隆起だけ長さを変えられる', () => {
    // 光りが消えていても隆起は続く（隆起の方が長いので実際に起きる状態）
    expect(heaveLift([gate({ flash: 0 })], 150, 299)).toBeGreaterThan(0);
    // 逆に光っていても隆起が終わっていれば持ち上げない
    expect(heaveLift([gate({ flash: CONFIG.GATE_FLASH_FRAMES, heave: 0 })], 150, 299)).toBe(0);
  });

  it('⚠️ 隆起は光りより長い（増えた合図が消えた後も山が戻りきる）', () => {
    expect(CONFIG.GATE_HEAVE_FRAMES).toBeGreaterThan(CONFIG.GATE_FLASH_FRAMES);
  });

  it('⚠️ 玉の直径（16px）を超えない＝重なって汚く見えない', () => {
    expect(CONFIG.GATE_HEAVE_VISUAL).toBeLessThanOrEqual(16);
  });

  it('0 にすると完全に無効（入れる前と同じ絵に戻せる）', () => {
    (CONFIG as unknown as Record<string, number>).GATE_HEAVE_VISUAL = 0;
    expect(heaveLift([gate()], 150, 299)).toBe(0);
  });

  it('重なった複数のゲートでは一番大きい持ち上げを採る', () => {
    const a = gate({ id: 0, heave: 2 });
    const b = gate({ id: 1, heave: CONFIG.GATE_HEAVE_FRAMES });
    expect(heaveLift([a, b], 150, 299)).toBe(heaveLift([b], 150, 299));
  });
});
