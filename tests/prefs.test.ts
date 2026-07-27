import { beforeEach, describe, expect, it } from 'vitest';
import { loadMineOnly, loadSpeed, saveMineOnly, saveSpeed } from '../src/ui/prefs';

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

/**
 * 速さの保持（2026-07-26 れいあ要望「速度設定を毎回設定するのは面倒」）。
 * ⚠️ スキンの好み（`marble-mill.prefs`）とは**別のキー**にする。
 *    工房で累計をリセットしてもスキンだけ戻り、速さは残るのが自然なため。
 */
describe('速さの保持', () => {
  it('まだ選んでいなければ既定の速さで始まる', () => {
    expect(loadSpeed([1, 2, 4], 1)).toBe(1);
  });

  it('選んだ速さを覚えていて、次に開いた時もそれで始まる', () => {
    saveSpeed(4);
    expect(loadSpeed([1, 2, 4], 1)).toBe(4);
  });

  it('⚠️ いま選べない速さが残っていたら既定に戻す', () => {
    // 0.5 は ?debug=1 の時だけ出る。普通に開いた時に残っていると
    // ボタンを押しても切り替わらない（一覧に無い値からは次へ進めないため）
    saveSpeed(0.5);
    expect(loadSpeed([1, 2, 4], 1)).toBe(1);
    expect(loadSpeed([0.5, 1, 2, 4], 1)).toBe(0.5);
  });

  it('壊れた値が入っていても既定に戻す', () => {
    localStorage.setItem('marble-mill.speed', 'こわれた');
    expect(loadSpeed([1, 2, 4], 1)).toBe(1);
  });

  it('保存できない環境でも落ちない', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('使えない');
      },
      setItem: () => {
        throw new Error('使えない');
      },
    } as unknown as Storage;
    expect(() => saveSpeed(2)).not.toThrow();
    expect(loadSpeed([1, 2, 4], 1)).toBe(1);
  });
});

/**
 * 「自分の型だけで遊ぶ」の保持（2026-07-27 れいあ要望）。
 * ⚠️ スキンの好み（`marble-mill.prefs`）とは別キーにする。あちらは `resolvePrefs` で
 *    「持っていないスキンを落とす」解決を通す入れ物なので、無関係な設定を混ぜない。
 */
describe('自分の型だけで遊ぶ設定', () => {
  it('既定は「既定の型と混ぜる」', () => {
    expect(loadMineOnly()).toBe(false);
  });

  it('切り替えを覚える', () => {
    saveMineOnly(true);
    expect(loadMineOnly()).toBe(true);
    saveMineOnly(false);
    expect(loadMineOnly()).toBe(false);
  });

  it('⚠️ スキンの好みと同じキーを使っていない（片方を消してもう片方が壊れない）', () => {
    saveMineOnly(true);
    localStorage.removeItem('marble-mill.prefs');
    expect(loadMineOnly()).toBe(true);
  });

  it('localStorage が使えなくても落ちない', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('使えない');
      },
      setItem: () => {
        throw new Error('使えない');
      },
    } as unknown as Storage;
    expect(() => saveMineOnly(true)).not.toThrow();
    expect(loadMineOnly()).toBe(false);
  });
});
