import { beforeEach, describe, expect, it } from 'vitest';
import { addTotal, getTotal, myTotalRank, RIVALS, totalRanking } from '../src/ui/totals';
import { UNLOCKS } from '../src/core/workshop';

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

  /**
   * 1ゲームの平均スコア（2026-07-25 実測・工房の閾値と同じ根拠）。
   * ⚠️ スコアの出方を変えたらこの値と `RIVALS` を作り直すこと。
   */
  const AVG_PER_GAME = 2_423;

  it('1ゲーム遊べば最下位から上がる（最初の達成感）', () => {
    // ⚠️ ここは以前 100,000 を足していて、実測(2,423)と桁が2つ違うため
    //    「下位が手の届く値か」を全く見張れていなかった（2026-07-26 是正）
    const before = myTotalRank();
    addTotal(AVG_PER_GAME);
    expect(myTotalRank()).toBeLessThan(before);
  });

  it('工房を全部解放するころには上位に入っている（メタ進行と歩調を合わせる）', () => {
    addTotal(Math.max(...UNLOCKS.map((u) => u.cost)));
    expect(myTotalRank()).toBeLessThanOrEqual(2);
  });

  it('⚠️ てっぺんが遠すぎない（放置すると世界ランクが永久に上がらない）', () => {
    const top = Math.max(...RIVALS.map((r) => r.total));
    expect(top / AVG_PER_GAME).toBeLessThan(200); // 200ゲーム以内で届く
  });

  it('間隔が詰まりすぎない（1ゲームで何人も飛び越さない）', () => {
    const sorted = [...RIVALS].sort((a, b) => a.total - b.total);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].total - sorted[i - 1].total).toBeGreaterThan(AVG_PER_GAME * 0.3);
    }
  });

  it('保存データが壊れていても0として扱う', () => {
    localStorage.setItem('marble-mill.total', 'こわれた');
    expect(getTotal()).toBe(0);
  });
});
