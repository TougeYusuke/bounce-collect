import { beforeEach, describe, expect, it } from 'vitest';
import { addTotal, getTotal, myTotalRank, RIVALS, totalRanking } from '../src/ui/totals';

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

describe('疑似トータルランキング', () => {
  it('最初の累積は0', () => {
    expect(getTotal()).toBe(0);
  });

  it('加算していくと累積が増える', () => {
    addTotal(100);
    addTotal(250);
    expect(getTotal()).toBe(350);
  });

  it('ランキングは架空プレイヤー全員＋自分を含む', () => {
    expect(totalRanking()).toHaveLength(RIVALS.length + 1);
  });

  it('自分の行はちょうど1つで isMe が立つ', () => {
    const me = totalRanking().filter((r) => r.isMe);
    expect(me).toHaveLength(1);
  });

  it('累積0のとき自分は最下位', () => {
    expect(myTotalRank()).toBe(RIVALS.length + 1);
  });

  it('累積が全員より大きいとき自分は1位', () => {
    const max = Math.max(...RIVALS.map((r) => r.total));
    addTotal(max + 1);
    expect(myTotalRank()).toBe(1);
  });

  it('1回遊ぶと最下位からは必ず上がる（下位が手の届く値になっている）', () => {
    const before = myTotalRank();
    addTotal(100_000); // 1ラウンドの現実的なスコア規模
    expect(myTotalRank()).toBeLessThan(before);
  });

  it('保存データが壊れていても0として扱う', () => {
    localStorage.setItem('marble-mill.total', 'こわれた');
    expect(getTotal()).toBe(0);
  });
});
