/**
 * 工房＝「やればやるだけ増える」メタ進行（2026-07-25 れいあ選択）。
 *
 * ── 設計の決まり ──
 * 🔑 **報酬は全部「盤面に見えるもの」だけ**（素材テーマ・玉の見た目・ステージの型）。
 *    ⚠️ 倍率+10% のような**数値強化は入れない**。このゲームは「落ちる球を見るゲーム」なので、
 *    数字が増えても画面が変わらない報酬は「やればやるだけ数字を管理する」に化ける（れいあ方針）。
 * 🔑 合格条件は1つ: **解放した瞬間、次のラウンドの画面が違って見えること**。
 *
 * ⚠️ **解放の状態は保存しない**。累計スコア（`totals.ts`）から**毎回計算する**。
 *    別に持つとセーブが二重になり、片方だけ壊れた時に直しようがなくなる。
 */

export type UnlockKind = 'ball' | 'theme' | 'stage';

export interface Unlock {
  kind: UnlockKind;
  /** 対応する Material.key / StageDef.name / BallSkin.key */
  key: string;
  /** 画面に出す名前 */
  name: string;
  /** これだけ累計を稼ぐと解放される */
  cost: number;
}

/** 最初から使えるもの。⚠️ ここが空になると1回も遊べなくなる */
export const FREE: Record<UnlockKind, string[]> = {
  ball: ['plain'],
  theme: ['wood', 'cherry'],
  stage: ['default', 'type-01-classic', 'type-02-wide-top'],
};

/**
 * 解放の並び。
 *
 * ⚠️ **種類を混ぜて並べること**。テーマ4つ→型6つ のように固めると、
 *    同じ種類が続く間「また同じ絵か」になって、解放のたびに画面が変わる狙いが薄れる。
 * ⚠️ 閾値は **1ゲーム平均2,423点**（2026-07-25 実測・6種で 634〜3,383点）を基準に置いた。
 *    最初の解放が1ゲーム目、最後が約43ゲーム目。⚠️ スコアの出方を変えたらここも作り直す。
 */
export const UNLOCKS: Unlock[] = [
  { kind: 'ball', key: 'amber', name: '琥珀のビー玉', cost: 1_500 },
  { kind: 'stage', key: 'type-04-tall-post', name: '型：長い柱', cost: 4_000 },
  { kind: 'theme', key: 'bamboo', name: '素材：竹', cost: 8_000 },
  { kind: 'stage', key: 'type-05-center-jump', name: '型：中央跳ね', cost: 13_000 },
  { kind: 'ball', key: 'steel', name: '鋼のビー玉', cost: 19_000 },
  { kind: 'theme', key: 'walnut', name: '素材：ウォールナット', cost: 26_000 },
  { kind: 'stage', key: 'type-06-zigzag', name: '型：ジグザグ', cost: 34_000 },
  { kind: 'theme', key: 'maple', name: '素材：メープル', cost: 43_000 },
  { kind: 'stage', key: 'type-07-cascade', name: '型：滝', cost: 53_000 },
  { kind: 'ball', key: 'glow', name: '蛍のビー玉', cost: 64_000 },
  { kind: 'theme', key: 'driftwood', name: '素材：古材', cost: 76_000 },
  { kind: 'stage', key: 'type-08-compact', name: '型：詰め合わせ', cost: 89_000 },
  { kind: 'stage', key: 'type-03-sparse', name: '型：まばら', cost: 103_000 },
];

/** その種類でいま使えるキー（最初から使えるもの＋累計で解放したもの） */
export function unlockedKeys(kind: UnlockKind, total: number): string[] {
  return [
    ...FREE[kind],
    ...UNLOCKS.filter((u) => u.kind === kind && total >= u.cost).map((u) => u.key),
  ];
}

/** 次に解放されるもの（全部解放済みなら null） */
export function nextUnlock(total: number): Unlock | null {
  return UNLOCKS.find((u) => total < u.cost) ?? null;
}

/** 解放済みの数 / 全体 */
export function unlockProgress(total: number): { done: number; all: number } {
  return { done: UNLOCKS.filter((u) => total >= u.cost).length, all: UNLOCKS.length };
}

/**
 * 見た目の好み（どのスキンを使うか）。
 * ⚠️ **保存した選択をそのまま信じない**。累計をリセットすると解放が最初に戻るので、
 *    持っていないスキンが選ばれたままになる。使う直前に必ずここを通す。
 */
export interface SkinPrefs {
  /** 玉のキー */
  ball: string;
  /** 素材テーマのキー。`RANDOM` で毎回抽選（既定・毎ラウンド景色が変わる） */
  theme: string;
}

/** 「おまかせ（毎回抽選）」を表す予約語。⚠️ 素材テーマのキーと衝突しない値にすること */
export const RANDOM = 'random';

export const DEFAULT_PREFS: SkinPrefs = { ball: FREE.ball[0], theme: RANDOM };

/** 持っていないものが選ばれていたら、持っているものへ落とす */
export function resolvePrefs(
  prefs: Partial<SkinPrefs> | null | undefined,
  ownedBalls: string[],
  ownedThemes: string[],
): SkinPrefs {
  const ball = prefs?.ball && ownedBalls.includes(prefs.ball) ? prefs.ball : ownedBalls[ownedBalls.length - 1] ?? DEFAULT_PREFS.ball;
  const theme =
    prefs?.theme === RANDOM || (prefs?.theme && ownedThemes.includes(prefs.theme))
      ? prefs.theme
      : RANDOM;
  return { ball, theme };
}
