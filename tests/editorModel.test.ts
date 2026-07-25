import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { DEFAULT_STAGE_DEF, normalizeStageDef } from '../src/core/stageDef';
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
    expect(m.grabMode(g.x1 + 1, g.y, { kind: 'gate', index: 0 })).toBe('resize-start');
    expect(m.grabMode(g.x2 - 1, g.y, { kind: 'gate', index: 0 })).toBe('resize-end');
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
    m.resizeTo('resize-end', g.x1 + 1);
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

describe('ジャンプ台の跳ね上限', () => {
  it('台ごとに跳ね返せる玉の個数を変えられる', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    m.setCapacity(40);
    expect(m.def.jumpers[0].capacity).toBe(40);
    expect(m.buildStage().jumpers[0].capacity).toBe(40);
  });

  it('指定していない台は CONFIG の既定値になる', () => {
    const m = model();
    expect(m.def.jumpers[0].capacity).toBeUndefined();
    expect(m.buildStage().jumpers[0].capacity).toBe(CONFIG.JUMPER_CAPACITY);
    expect(m.capacityOf({ kind: 'jumper', index: 0 })).toBe(CONFIG.JUMPER_CAPACITY);
  });

  it('⚠️ 0以下や壊れた値は入らない（0にすると台が最初から死ぬ）', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    m.setCapacity(0);
    expect(m.def.jumpers[0].capacity).toBe(1);
    m.setCapacity(Number.NaN);
    expect(m.def.jumpers[0].capacity).toBe(1);
  });

  it('跳ね上限の変更はゲートには効かない', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    expect(() => m.setCapacity(40)).not.toThrow();
    expect(m.capacityOf({ kind: 'gate', index: 0 })).toBeNull();
  });
});

describe('十字キーでの移動', () => {
  it('相対に動かせる（吸着したまま）', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    const cx0 = (m.def.gates[0].x1 + m.def.gates[0].x2) / 2;
    m.moveBy(CONFIG.EDITOR_GRID, 0);

    // ⚠️ 1回目は「吸着に乗せる」ぶん、ちょうど1目盛りとは限らない
    //    （既定ステージの座標は盤面幅の比率で決まっていてグリッド上にない）
    const cx1 = (m.def.gates[0].x1 + m.def.gates[0].x2) / 2;
    expect(cx1).toBeGreaterThan(cx0 - CONFIG.EDITOR_GRID);
    expect(cx1 % CONFIG.EDITOR_GRID).toBe(0);

    // 乗ってしまえば、以降はきっちり1目盛りずつ進む
    m.moveBy(CONFIG.EDITOR_GRID, CONFIG.EDITOR_GRID);
    const g = m.def.gates[0];
    expect((g.x1 + g.x2) / 2).toBe(cx1 + CONFIG.EDITOR_GRID);
    expect(g.y % CONFIG.EDITOR_GRID).toBe(0);
  });

  it('仕切りは形を保ったまま動く', () => {
    const m = model();
    m.select({ kind: 'divider', index: 0 });
    const d = m.def.dividers[0];
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    m.moveBy(-CONFIG.EDITOR_GRID, CONFIG.EDITOR_GRID * 2);
    const after = m.def.dividers[0];
    expect(Math.hypot(after.x2 - after.x1, after.y2 - after.y1)).toBeCloseTo(len);
  });

  it('⚠️ 十字キーでも制約は効く（ジャンプ台は帯から出ない）', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    for (let i = 0; i < 40; i++) m.moveBy(0, -CONFIG.EDITOR_GRID);
    expect(m.def.jumpers[0].y).toBeGreaterThanOrEqual(CONFIG.JUMPER_ZONE_TOP);
  });

  it('選択していない時は何も起きない', () => {
    const m = model();
    const before = structuredClone(m.def);
    m.moveBy(5, 5);
    expect(m.def).toEqual(before);
  });
});

describe('ジャンプ台は最下段に1台まで', () => {
  it('⚠️ 2台目は足せない', () => {
    const m = model();
    expect(m.def.jumpers).toHaveLength(1);
    expect(m.canAddJumper()).toBe(false);
    m.addJumper();
    expect(m.def.jumpers).toHaveLength(1);
  });

  it('消せばまた足せる', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    m.deleteSelected();
    expect(m.canAddJumper()).toBe(true);
    m.addJumper();
    expect(m.def.jumpers).toHaveLength(1);
  });

  it('⚠️ 最下段の帯より上へは動かせない', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    m.moveTo(180, 100);
    expect(m.def.jumpers[0].y).toBeGreaterThanOrEqual(CONFIG.JUMPER_ZONE_TOP);
  });

  it('ゲートは帯の制限を受けない', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.moveTo(180, 100);
    expect(m.def.gates[0].y).toBe(100);
  });

  it('数値を打ち込んでも帯の外へは出せない', () => {
    const m = model();
    m.select({ kind: 'jumper', index: 0 });
    m.def.jumpers[0].y = 50;
    m.normalizeSelected();
    expect(m.def.jumpers[0].y).toBe(CONFIG.JUMPER_ZONE_TOP);
  });
});

describe('中身の振り直し', () => {
  it('位置は変わらず、倍率と跳ね上限だけ変わる', () => {
    const m = model();
    const before = m.def.gates.map((g) => [g.x1, g.x2, g.y]);
    m.roll(12345);
    expect(m.def.gates.map((g) => [g.x1, g.x2, g.y])).toEqual(before);
    expect(m.def.jumpers[0].capacity).toBeGreaterThanOrEqual(CONFIG.JUMPER_CAPACITY_MIN);
    expect(m.selected).toBeNull();
  });
});

describe('仕切り棒の編集', () => {
  it('仕切りの上を指すと選べる', () => {
    const m = model();
    const d = m.def.dividers[0];
    expect(m.pick((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2)).toEqual({ kind: 'divider', index: 0 });
  });

  it('⚠️ ゲートと重なる所ではゲートが優先される（細い線に取られると掴めない）', () => {
    const m = model();
    const d = m.def.dividers[0];
    // ⚠️ 段（255/375/500）から離れた高さへ動かす。段の上だと、そこに元からある
    //    別のゲートも掴めてしまい「どのゲートが優先か」の判定にならない
    const y = d.y1 + 40;
    m.def.gates[0].y = y;
    m.def.gates[0].x1 = d.x1 - 40;
    m.def.gates[0].x2 = d.x1 + 40;
    expect(m.pick(d.x1, y)).toEqual({ kind: 'gate', index: 0 });
  });

  it('端点をつかむと長さを変えるモードになる', () => {
    const m = model();
    const d = m.def.dividers[0];
    const sel = { kind: 'divider', index: 0 } as const;
    expect(m.grabMode(d.x1, d.y1 + 2, sel)).toBe('resize-start');
    expect(m.grabMode(d.x2, d.y2 - 2, sel)).toBe('resize-end');
    expect(m.grabMode((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, sel)).toBe('move');
  });

  it('端点は縦にも横にも動く（斜めの仕切りが作れる）', () => {
    const m = model();
    m.select({ kind: 'divider', index: 0 });
    m.resizeTo('resize-end', 250, 400);
    const d = m.def.dividers[0];
    expect(d.x2).toBe(250);
    expect(d.y2).toBe(400);
  });

  it('⚠️ 短すぎる仕切りにはならない（向きを保ったまま最小の長さまで伸びる）', () => {
    const m = model();
    m.select({ kind: 'divider', index: 0 });
    const d = m.def.dividers[0];
    m.resizeTo('resize-end', d.x1, d.y1 + 1);
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    expect(len).toBeGreaterThanOrEqual(CONFIG.EDITOR_MIN_WIDTH);
  });

  it('動かすと形を保ったまま平行移動する', () => {
    const m = model();
    m.select({ kind: 'divider', index: 0 });
    const before = m.def.dividers[0];
    const len = Math.hypot(before.x2 - before.x1, before.y2 - before.y1);
    m.moveTo(120, 400);
    const after = m.def.dividers[0];
    expect(Math.hypot(after.x2 - after.x1, after.y2 - after.y1)).toBeCloseTo(len);
    expect((after.x1 + after.x2) / 2).toBe(120);
    expect((after.y1 + after.y2) / 2).toBe(400);
  });

  it('仕切りを足せる・消せる', () => {
    const m = model();
    const before = m.def.dividers.length;
    m.addDivider();
    expect(m.def.dividers.length).toBe(before + 1);
    expect(m.selected).toEqual({ kind: 'divider', index: before });
    m.deleteSelected();
    expect(m.def.dividers.length).toBe(before);
    expect(m.selected).toBeNull();
  });

  it('仕切りは実行時のステージの線分になる', () => {
    const m = model();
    m.addDivider();
    const stage = m.buildStage();
    // 仕切り + V字漏斗の2枚
    expect(stage.segments.length).toBe(m.def.dividers.length + 2);
  });
});

describe('保存したステージを開く', () => {
  it('読み込むと中身が入れ替わって選択が外れる', () => {
    const m = model();
    m.select({ kind: 'gate', index: 0 });
    m.load({ name: 'foo', gates: [], jumpers: [], dividers: [] });
    expect(m.def.name).toBe('foo');
    expect(m.def.gates).toHaveLength(0);
    expect(m.selected).toBeNull();
  });

  it('⚠️ 手で書き換えて欠けたJSONでも落ちない（項目が無ければ空で埋める）', () => {
    const m = model();
    m.load(normalizeStageDef({ name: 'broken', gates: [{ x1: 10, x2: 90, y: 100 }] }));
    expect(m.def.jumpers).toEqual([]);
    expect(m.def.dividers).toEqual([]);
    expect(m.def.gates[0].multiplier).toBe(2);
    expect(() => m.buildStage()).not.toThrow();
  });

  it('名前が無いJSONでも読める', () => {
    const def = normalizeStageDef({});
    expect(typeof def.name).toBe('string');
    expect(def.gates).toEqual([]);
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
