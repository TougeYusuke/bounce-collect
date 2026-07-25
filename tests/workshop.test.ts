import { describe, expect, it } from 'vitest';
import { FREE, UNLOCKS, nextUnlock, unlockProgress, unlockedKeys } from '../src/core/workshop';
import { STAGES } from '../src/core/stages';
import { BALL_SKINS, MATERIALS } from '../src/render/theme';

describe('工房の解放', () => {
  it('最初は無料のものだけ使える', () => {
    expect(unlockedKeys('theme', 0)).toEqual(FREE.theme);
    expect(unlockedKeys('stage', 0)).toEqual(FREE.stage);
    expect(unlockedKeys('ball', 0)).toEqual(FREE.ball);
  });

  it('⚠️ 最初から遊べること（無料の型・テーマ・玉がゼロだと1回も遊べない）', () => {
    expect(FREE.stage.length).toBeGreaterThan(0);
    expect(FREE.theme.length).toBeGreaterThan(0);
    expect(FREE.ball.length).toBeGreaterThan(0);
  });

  it('累計がコストを越えると解放される', () => {
    const first = UNLOCKS[0];
    expect(unlockedKeys(first.kind, first.cost - 1)).not.toContain(first.key);
    expect(unlockedKeys(first.kind, first.cost)).toContain(first.key);
  });

  it('全部稼ぐと全部使える', () => {
    const max = UNLOCKS[UNLOCKS.length - 1].cost;
    expect(unlockedKeys('theme', max).length).toBe(MATERIALS.length);
    expect(unlockedKeys('stage', max).length).toBe(STAGES.length);
    expect(unlockedKeys('ball', max).length).toBe(BALL_SKINS.length);
  });

  /**
   * 🔑 一番大事なテスト。
   * ⚠️ 解放のキーは文字列で持っているので、素材テーマや型の名前を変えると
   *    **一致しなくなって永久に解放されない**（画面にはコストだけ出て、稼いでも何も起きない）。
   */
  it('⚠️ 解放のキーが実在する（名前を変えた時に気づけるように）', () => {
    const known: Record<string, string[]> = {
      theme: MATERIALS.map((m) => m.key),
      stage: STAGES.map((s) => s.name),
      ball: BALL_SKINS.map((b) => b.key),
    };
    for (const u of [...UNLOCKS, ...Object.entries(FREE).flatMap(([k, keys]) => keys.map((key) => ({ kind: k, key, name: key })))]) {
      expect(known[u.kind], `${u.kind} の一覧`).toContain(u.key);
    }
  });

  it('⚠️ 同じものを二重に解放しない／無料のものを有料にしない', () => {
    const seen = new Set<string>();
    for (const u of UNLOCKS) {
      const id = `${u.kind}:${u.key}`;
      expect(seen.has(id), `${id} が重複`).toBe(false);
      expect(FREE[u.kind].includes(u.key), `${id} は無料なのに有料`).toBe(false);
      seen.add(id);
    }
  });

  it('コストは小さい順（次の解放が前後しないように）', () => {
    for (let i = 1; i < UNLOCKS.length; i++) {
      expect(UNLOCKS[i].cost).toBeGreaterThan(UNLOCKS[i - 1].cost);
    }
  });

  it('次の解放とその進み具合が出る', () => {
    expect(nextUnlock(0)).toBe(UNLOCKS[0]);
    expect(nextUnlock(UNLOCKS[UNLOCKS.length - 1].cost)).toBeNull();
    expect(unlockProgress(0)).toEqual({ done: 0, all: UNLOCKS.length });
    expect(unlockProgress(UNLOCKS[0].cost).done).toBe(1);
  });

  it('⚠️ 種類が固まって並んでいない（同じ種類が3連続すると解放しても画面が代わり映えしない）', () => {
    for (let i = 2; i < UNLOCKS.length; i++) {
      const same = UNLOCKS[i].kind === UNLOCKS[i - 1].kind && UNLOCKS[i].kind === UNLOCKS[i - 2].kind;
      expect(same, `${i} 番目で ${UNLOCKS[i].kind} が3連続`).toBe(false);
    }
  });
});
