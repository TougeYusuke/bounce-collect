import { describe, expect, it } from 'vitest';
import {
  FREE,
  RANDOM,
  UNLOCKS,
  VISIBLE_KINDS,
  nextUnlock,
  resolvePrefs,
  unlockProgress,
  unlockedKeys,
} from '../src/core/workshop';
import { STAGES } from '../src/core/stages';
import { BALL_SKINS, BUCKET_SKINS, MATERIALS } from '../src/render/theme';

describe('工房の解放', () => {
  it('最初は無料のものだけ使える', () => {
    expect(unlockedKeys('bucket', 0)).toEqual(FREE.bucket);
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
    expect(unlockedKeys('bucket', max).length).toBe(BUCKET_SKINS.length);
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
      bucket: BUCKET_SKINS.map((b) => b.key),
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
    // ⚠️ 型は工房に出さないので数に入らない（2026-07-25）
    const visibleAll = UNLOCKS.filter((u) => VISIBLE_KINDS.includes(u.kind)).length;
    expect(unlockProgress(0)).toEqual({ done: 0, all: visibleAll });
    expect(unlockProgress(UNLOCKS[0].cost).done).toBe(1);
  });

  it('⚠️ 種類が固まって並んでいない（同じ種類が3連続すると解放しても画面が代わり映えしない）', () => {
    for (let i = 2; i < UNLOCKS.length; i++) {
      const same = UNLOCKS[i].kind === UNLOCKS[i - 1].kind && UNLOCKS[i].kind === UNLOCKS[i - 2].kind;
      expect(same, `${i} 番目で ${UNLOCKS[i].kind} が3連続`).toBe(false);
    }
  });
});

describe('スキンの好み', () => {
  it('持っているものが選べる', () => {
    expect(
      resolvePrefs({ ball: 'amber', theme: 'bamboo', bucket: 'iron' }, ['plain', 'amber'], ['wood', 'bamboo'], ['wood', 'iron']),
    ).toEqual({ ball: 'amber', theme: 'bamboo', bucket: 'iron' });
  });

  it('⚠️ 持っていないものが選ばれていたら落とす（累計リセット後に起きる）', () => {
    // 玉は持っている中でいちばん新しいものへ、素材はおまかせへ
    expect(
      resolvePrefs({ ball: 'glow', theme: 'maple', bucket: 'jade' }, ['plain', 'amber'], ['wood'], ['wood']),
    ).toEqual({ ball: 'amber', theme: RANDOM, bucket: 'wood' });
  });

  it('未設定なら玉は最新・素材はおまかせ', () => {
    expect(resolvePrefs(null, ['plain'], ['wood'], ['wood'])).toEqual({
      ball: 'plain',
      theme: RANDOM,
      bucket: 'wood',
    });
  });

  it('おまかせは持ち物に関係なく選べる', () => {
    expect(resolvePrefs({ ball: 'plain', theme: RANDOM }, ['plain'], ['wood'], ['wood']).theme).toBe(RANDOM);
  });

  it('⚠️ おまかせの予約語が素材テーマのキーと衝突しない', () => {
    expect(MATERIALS.map((m) => m.key)).not.toContain(RANDOM);
  });
});

describe('工房に出す種類', () => {
  it('⚠️ 型は出さない（内部で管理する・知らない方がワクワクする・2026-07-25 れいあ判断）', () => {
    expect(VISIBLE_KINDS).not.toContain('stage');
  });

  it('⚠️ 型の解放は続いている（黙って盤面が増える）', () => {
    expect(UNLOCKS.some((u) => u.kind === 'stage')).toBe(true);
    const max = UNLOCKS[UNLOCKS.length - 1].cost;
    expect(unlockedKeys('stage', max).length).toBeGreaterThan(FREE.stage.length);
  });

  it('⚠️ 次の解放に型が出てこない（サプライズを潰さない）', () => {
    for (const t of [0, 5_000, 20_000, 50_000, 90_000]) {
      expect(nextUnlock(t)?.kind).not.toBe('stage');
    }
  });
});

describe('形と色は別の軸', () => {
  it('⚠️ 形（星・ハート等）にも色のパレットを付けられる', () => {
    const mixed = BALL_SKINS.filter((b) => b.shape && b.shape !== 'circle' && b.palette);
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('⚠️ パレットは2色以上（1色なら単色スキンと同じで焼くスプライトが無駄に増える）', () => {
    for (const b of BALL_SKINS) {
      if (b.palette) expect(b.palette.length).toBeGreaterThan(1);
    }
  });

  it('⚠️ 器は画像を増やさず輪郭から描く（形を足すたびに素材を用意しない方針・2026-07-25）', () => {
    const drawn = BUCKET_SKINS.filter((b) => b.form !== 'image');
    expect(drawn.length).toBeGreaterThan(3);
    // 描く器は色が4つそろっていること（欠けると真っ黒や透明になる）
    for (const b of drawn) {
      for (const k of ['body', 'shade', 'rim', 'inner'] as const) expect(b[k]).toBeTruthy();
    }
  });

  it('⚠️ 木製だけにしない（れいあ方針「木製にこだわらない」）', () => {
    expect(new Set(BUCKET_SKINS.map((b) => b.form)).size).toBeGreaterThan(3);
  });
});

describe('名前のズレ', () => {
  /**
   * ⚠️ 解放リストは自分で名前を持っている（無料のぶんは持ち物側の名前を使う）ので、
   *    片方だけ直すと**工房で2つの名前が混ざる**（実測: 「鉄のバケツ」と「黒鉄のバケツ」が併存した）。
   */
  it('解放リストと持ち物の名前が一致する', () => {
    const names: Record<string, Map<string, string>> = {
      ball: new Map(BALL_SKINS.map((b) => [b.key, b.name])),
      bucket: new Map(BUCKET_SKINS.map((b) => [b.key, b.name])),
    };
    for (const u of UNLOCKS) {
      const m = names[u.kind];
      if (!m) continue; // 素材と型は接頭辞を付けて出すので対象外
      expect(u.name, `${u.kind}:${u.key}`).toBe(m.get(u.key));
    }
  });
});
