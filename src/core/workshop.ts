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

export type UnlockKind = 'ball' | 'theme' | 'bucket' | 'stage';

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
  bucket: ['wood'],
  stage: ['default', 'type-01-classic', 'type-02-wide-top'],
};

/**
 * 解放の並び。
 *
 * ⚠️ **種類を混ぜて並べること**。テーマ4つ→型6つ のように固めると、
 *    同じ種類が続く間「また同じ絵か」になって、解放のたびに画面が変わる狙いが薄れる。
 * ⚠️ 閾値は **1ゲーム平均2,423点**（2026-07-25 実測・6種で 634〜3,383点）を基準に置いた。
 *    最初の解放が1ゲーム目、最後（308,000）が**約127ゲーム目**。⚠️ スコアの出方を変えたらここも作り直す。
 *    （2026-07-26 れいあ実機判定＝解放テンポは○「いい感じ」）
 *
 * 🔴 **型を `src/stages/` に足したらここにも1行足すこと**。
 *    `tests/workshop.test.ts` が「全部解放した時の型の数 == 型の総数」を見張っていて、落ちる。
 *    ⚠️ **末尾に足さない**＝型だけ遠くに固まって「遊んでも新しい盤面が出てこない」状態になる。
 */
export const UNLOCKS: Unlock[] = [
  { kind: 'ball', key: 'amber', name: '琥珀のビー玉', cost: 1_500 },
  { kind: 'stage', key: 'type-04-tall-post', name: '型：長い柱', cost: 3_500 },
  { kind: 'theme', key: 'bamboo', name: '素材：竹', cost: 6_000 },
  { kind: 'ball', key: 'marble', name: '五色マーブル', cost: 9_000 },
  { kind: 'bucket', key: 'iron', name: '鉄のバケツ', cost: 13_000 },
  { kind: 'stage', key: 'type-05-center-jump', name: '型：中央跳ね', cost: 18_000 },
  { kind: 'ball', key: 'heart', name: 'ハート', cost: 23_000 },
  { kind: 'theme', key: 'walnut', name: '素材：ウォールナット', cost: 29_000 },
  // ⚠️ 以下 3つの `type-*-r80*` は `npm run stages:gen` がゼロから作って合格した型（2026-07-26）。
  //    **末尾に足さず既存の解放の間に挿している**＝型だけ遠くに固まると
  //    「遊んでも新しい盤面が出てこない」状態になるため。
  { kind: 'stage', key: 'type-09-r80', name: '型：右台・道なし', cost: 33_000 },
  { kind: 'ball', key: 'baseball', name: '野球ボール', cost: 36_000 },
  { kind: 'bucket', key: 'copper', name: '銅のバケツ', cost: 44_000 },
  { kind: 'stage', key: 'type-06-zigzag', name: '型：ジグザグ', cost: 53_000 },
  { kind: 'ball', key: 'hex', name: '六角ガラス', cost: 63_000 },
  { kind: 'theme', key: 'maple', name: '素材：メープル', cost: 74_000 },
  { kind: 'ball', key: 'steel', name: '鋼のビー玉', cost: 86_000 },
  { kind: 'bucket', key: 'tumbler', name: 'タンブラー', cost: 99_000 },
  { kind: 'stage', key: 'type-20-r80lane', name: '型：右台・細い道', cost: 105_000 },
  { kind: 'stage', key: 'type-07-cascade', name: '型：滝', cost: 113_000 },
  { kind: 'ball', key: 'coin', name: '金貨', cost: 128_000 },
  { kind: 'theme', key: 'driftwood', name: '素材：古材', cost: 144_000 },
  { kind: 'ball', key: 'star', name: '星のかけら', cost: 161_000 },
  { kind: 'bucket', key: 'mug', name: 'マグカップ', cost: 179_000 },
  { kind: 'stage', key: 'type-08-compact', name: '型：詰め合わせ', cost: 198_000 },
  { kind: 'ball', key: 'star-mix', name: '五色の星', cost: 218_000 },
  { kind: 'stage', key: 'type-43-r80lane', name: '型：右台・広い道', cost: 230_000 },
  { kind: 'bucket', key: 'glass', name: 'ガラスのコップ', cost: 239_000 },
  { kind: 'ball', key: 'glow', name: '蛍のビー玉', cost: 261_000 },
  { kind: 'bucket', key: 'jade', name: '翡翠の壺', cost: 272_000 },
  { kind: 'stage', key: 'type-03-sparse', name: '型：まばら', cost: 284_000 },
  { kind: 'ball', key: 'heart-mix', name: '五色のハート', cost: 308_000 },
];

/**
 * 工房に出す種類。
 * 🔑 **型（ステージ）は出さない**（2026-07-25 れいあ判断
 *    「これは内部で管理すればいい。作るたびにサムネイルを用意するのも面倒だし、
 *    何より知らないほうがワクワク感はありそう」）。
 *    ⚠️ 型の解放そのものは続ける＝遊ぶほど**黙って**新しい盤面が混ざる。
 *    だから「次の解放」「解放 N/M」も**見える種類だけ**で数える（見えないものを数えると数が合わない）。
 */
export const VISIBLE_KINDS: UnlockKind[] = ['ball', 'theme', 'bucket'];

const visible = (u: Unlock): boolean => VISIBLE_KINDS.includes(u.kind);

/** その種類でいま使えるキー（最初から使えるもの＋累計で解放したもの） */
export function unlockedKeys(kind: UnlockKind, total: number): string[] {
  return [
    ...FREE[kind],
    ...UNLOCKS.filter((u) => u.kind === kind && total >= u.cost).map((u) => u.key),
  ];
}

/** 次に解放される「見えるもの」（全部解放済みなら null）。⚠️ 型は数に入れない */
export function nextUnlock(total: number): Unlock | null {
  return UNLOCKS.find((u) => visible(u) && total < u.cost) ?? null;
}

/** 解放済みの数 / 全体。⚠️ 型は数に入れない（工房に出さないため） */
export function unlockProgress(total: number): { done: number; all: number } {
  const list = UNLOCKS.filter(visible);
  return { done: list.filter((u) => total >= u.cost).length, all: list.length };
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
  /** 上バケツのキー */
  bucket: string;
}

/** 「おまかせ（毎回抽選）」を表す予約語。⚠️ 素材テーマのキーと衝突しない値にすること */
export const RANDOM = 'random';

export const DEFAULT_PREFS: SkinPrefs = { ball: FREE.ball[0], theme: RANDOM, bucket: FREE.bucket[0] };

/** 持っていないものが選ばれていたら、持っているものへ落とす */
export function resolvePrefs(
  prefs: Partial<SkinPrefs> | null | undefined,
  ownedBalls: string[],
  ownedThemes: string[],
  ownedBuckets: string[] = FREE.bucket,
): SkinPrefs {
  const last = (owned: string[], fallback: string) => owned[owned.length - 1] ?? fallback;
  const ball =
    prefs?.ball && ownedBalls.includes(prefs.ball) ? prefs.ball : last(ownedBalls, DEFAULT_PREFS.ball);
  const theme =
    prefs?.theme === RANDOM || (prefs?.theme && ownedThemes.includes(prefs.theme))
      ? prefs.theme
      : RANDOM;
  const bucket =
    prefs?.bucket && ownedBuckets.includes(prefs.bucket)
      ? prefs.bucket
      : last(ownedBuckets, DEFAULT_PREFS.bucket);
  return { ball, theme, bucket };
}
