import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { DEFAULT_STAGE_DEF } from '../src/core/stageDef';
import { EditorModel } from '../src/editor/editorModel';

function model(): EditorModel {
  return new EditorModel(structuredClone(DEFAULT_STAGE_DEF));
}

describe('エディタの選択', () => {
  it('バーの上を指すとそのバーが選ばれる', () => {
    const m = model();
    const g = m.def.gates[0];
    const hit = m.pick((g.x1 + g.x2) / 2, g.y);
    expect(hit).toEqual({ kind: 'gate', index: 0 });
  });

  it('何も無いところを指すと選択なし', () => {
    const m = model();
    expect(m.pick(5, 5)).toBeNull();
  });

  it('端をつかむと「長さを変える」モードになる', () => {
    const m = model();
    const g = m.def.gates[0];
    expect(m.grabMode(g.x1 + 1, g.y, { kind: 'gate', index: 0 })).toBe('resize-left');
    expect(m.grabMode(g.x2 - 1, g.y, { kind: 'gate', index: 0 })).toBe('resize-right');
    expect(m.grabMode((g.x1 + g.x2) / 2, g.y, { kind: 'gate', index: 0 })).toBe('move');
  });
});

describe('エディタの移動', () => {
  it('動かすとグリッドに吸着する', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.moveTo(103, 207);
    const g = m.def.gates[0];
    const cx = (g.x1 + g.x2) / 2;
    expect(cx % CONFIG.EDITOR_GRID).toBe(0);
    expect(g.y % CONFIG.EDITOR_GRID).toBe(0);
  });

  it('盤面の外へは出せない', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.moveTo(-500, -500);
    const g = m.def.gates[0];
    expect(g.x1).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);

    m.moveTo(9999, 9999);
    const g2 = m.def.gates[0];
    expect(g2.x2).toBeLessThanOrEqual(CONFIG.BOARD_WIDTH);
    expect(g2.y).toBeLessThanOrEqual(CONFIG.BOARD_HEIGHT);
  });

  it('長さを変えても最小幅を下回らない（狭すぎると玉が通れない）', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    const g = m.def.gates[0];
    m.resizeTo('resize-right', g.x1 + 1);
    expect(m.def.gates[0].x2 - m.def.gates[0].x1).toBeGreaterThanOrEqual(CONFIG.EDITOR_MIN_WIDTH);
  });
});

describe('エディタの追加・削除', () => {
  it('ゲートを足せる', () => {
    const m = model();
    const before = m.def.gates.length;
    m.addGate();
    expect(m.def.gates.length).toBe(before + 1);
    expect(m.selected).toEqual({ kind: 'gate', index: before });
  });

  it('⚠️ 32個を超えては足せない（マスクが32bitのため）', () => {
    const m = model();
    while (m.def.gates.length < 32) m.addGate();
    expect(m.canAddGate()).toBe(false);
    m.addGate();
    expect(m.def.gates.length).toBe(32);
  });

  it('選択中のものを消せる', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    const before = m.def.jumpers.length;
    m.deleteSelected();
    expect(m.def.jumpers.length).toBe(before - 1);
    expect(m.selected).toBeNull();
  });

  it('倍率を変えられる', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.setMultiplier(10);
    expect(m.def.gates[0].multiplier).toBe(10);
  });

  it('倍率の変更はジャンプ台には効かない', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    expect(() => m.setMultiplier(10)).not.toThrow();
  });
});

describe('組み立て', () => {
  it('編集した内容がそのまま実行時のステージになる', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.setMultiplier(10);
    const stage = m.buildStage();
    expect(stage.gates[0].multiplier).toBe(10);
    expect(stage.wedges?.length).toBe(2);
  });
});
