import { beforeEach, describe, expect, it } from 'vitest';
import { addScore, loadScores, MAX_SCORES } from '../src/ui/scores';

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

describe('ハイスコア', () => {
  it('最初は空', () => {
    expect(loadScores()).toEqual([]);
  });

  it('降順に並ぶ', () => {
    addScore({ score: 100, date: '2026-07-24', material: 'チェリー' });
    addScore({ score: 500, date: '2026-07-24', material: '竹' });
    addScore({ score: 300, date: '2026-07-24', material: '古材' });
    expect(loadScores().map((s) => s.score)).toEqual([500, 300, 100]);
  });

  it('上限を超えたら下が切られる', () => {
    for (let i = 1; i <= MAX_SCORES + 5; i++) {
      addScore({ score: i, date: '2026-07-24', material: '竹' });
    }
    const all = loadScores();
    expect(all).toHaveLength(MAX_SCORES);
    expect(all[all.length - 1].score).toBe(6);
  });

  it('何位に入ったかを返す（0始まり）', () => {
    addScore({ score: 100, date: '2026-07-24', material: '竹' });
    expect(addScore({ score: 200, date: '2026-07-24', material: '竹' })).toBe(0);
  });

  it('圏外なら -1 を返す', () => {
    for (let i = 1; i <= MAX_SCORES; i++) {
      addScore({ score: 1000 + i, date: '2026-07-24', material: '竹' });
    }
    expect(addScore({ score: 1, date: '2026-07-24', material: '竹' })).toBe(-1);
  });

  it('保存データが壊れていても落ちない', () => {
    localStorage.setItem('marble-mill.scores', '{壊れたJSON');
    expect(loadScores()).toEqual([]);
  });
});
