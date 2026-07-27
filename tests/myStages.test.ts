import { beforeEach, describe, expect, it } from 'vitest';
import {
  MY_STAGE_MAX,
  loadMyStages,
  myStageDefs,
  removeMyStage,
  saveMyStage,
} from '../src/core/myStages';
import { DEFAULT_STAGE_DEF, type StageDef } from '../src/core/stageDef';

// localStorage の最小限のスタブ（vitest はブラウザ環境ではない）
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

function def(name: string): StageDef {
  return { ...structuredClone(DEFAULT_STAGE_DEF), name };
}

/**
 * プレイヤーが自分で作った／リンクでもらった型の置き場。
 * ⚠️ リアが量産して製品に同梱する型（`src/stages/*.json`）とは別系統。
 */
describe('自分の型の保存', () => {
  it('保存したら読み出せる', () => {
    expect(saveMyStage(def('わたしの型'), 'me').ok).toBe(true);
    const list = loadMyStages();
    expect(list).toHaveLength(1);
    expect(list[0].def.name).toBe('わたしの型');
    expect(list[0].from).toBe('me');
  });

  it('同じ名前で保存し直すと上書きになる（型を直して保存する動き）', () => {
    saveMyStage(def('あ'), 'me');
    saveMyStage(def('あ'), 'me');
    expect(loadMyStages()).toHaveLength(1);
  });

  it('⚠️ もらった型が自作と同名なら、消さずに名前をずらして残す', () => {
    saveMyStage(def('あ'), 'me');
    saveMyStage(def('あ'), 'link');
    const names = loadMyStages().map((s) => s.def.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('あ');
    expect(names.some((n) => n !== 'あ')).toBe(true);
  });

  it(`⚠️ 上限（${MY_STAGE_MAX}個）を超えたら黙って捨てずに失敗を返す`, () => {
    for (let i = 0; i < MY_STAGE_MAX; i++) saveMyStage(def(`t${i}`), 'me');
    const r = saveMyStage(def('あふれる'), 'me');
    expect(r.ok).toBe(false);
    expect(loadMyStages()).toHaveLength(MY_STAGE_MAX);
  });

  it('⚠️ 上限に達していても、既にある型の上書きは通す（直して保存し直せなくなるため）', () => {
    for (let i = 0; i < MY_STAGE_MAX; i++) saveMyStage(def(`t${i}`), 'me');
    expect(saveMyStage(def('t0'), 'me').ok).toBe(true);
    expect(loadMyStages()).toHaveLength(MY_STAGE_MAX);
  });

  it('壊れたJSONが入っていても落ちない（空として扱う）', () => {
    localStorage.setItem('marble-mill.mystages', '{こわれた');
    expect(loadMyStages()).toEqual([]);
  });

  it('項目が欠けた型も normalizeStageDef で整えて返す', () => {
    localStorage.setItem(
      'marble-mill.mystages',
      JSON.stringify([{ def: { name: 'かけてる' }, from: 'me' }]),
    );
    const s = loadMyStages()[0];
    expect(s.def.name).toBe('かけてる');
    expect(s.def.gates).toEqual([]);
    expect(s.def.jumpers).toEqual([]);
    expect(s.def.dividers).toEqual([]);
  });

  it('配列でないものが入っていても落ちない', () => {
    localStorage.setItem('marble-mill.mystages', '{"a":1}');
    expect(loadMyStages()).toEqual([]);
  });

  it('削除できる', () => {
    saveMyStage(def('け'), 'me');
    removeMyStage('け');
    expect(loadMyStages()).toEqual([]);
  });

  it('myStageDefs は StageDef の配列だけ返す（抽選に混ぜる用）', () => {
    saveMyStage(def('ま'), 'me');
    const defs = myStageDefs();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('ま');
    expect(defs[0].gates.length).toBeGreaterThan(0);
  });
});
