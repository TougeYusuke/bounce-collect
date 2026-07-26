import { existsSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';
import { normalizeStageDef, type StageDef } from '../src/core/stageDef';
import { RUBRIC, judge, line } from './stageRubric';

/**
 * ステージを**ゼロから作る**。`npm run stages:gen`
 *
 * ⚠️ `stages:lane` との違い＝あちらは**既にある型を直す**道具。こちらは**無から配置を振って、
 *    合格したものだけ残す**。れいあ指定（2026-07-25）「基本はリアたちのみでステージを量産できるとうれしい」
 *    の最後のピース。
 *
 * 進め方（3段構え・全部回すと重いので粗い順に落とす）:
 *   1. 種から完成形を1つ作る（段・分割・倍率・台の位置・レーンを全部種から決める）
 *   2. 粗い下見（落とす位置3か所 × 1回）で足切り
 *   3. 残ったものだけ本判定（`judge`＝5か所 × 2回）にかけ、合格だけ保存
 *
 * 使い方:
 *   npm run stages:gen                      # 既定＝種60個から最大3型を保存
 *   STAGE_GEN_SEEDS=200 STAGE_GEN_KEEP=6 npm run stages:gen
 *   STAGE_GEN_DRY=1 npm run stages:gen      # 保存せず結果だけ見る
 *
 * ⚠️ 保存すると `src/stages/*.json` が増え、**そのまま製品の抽選に入る**（`stages.ts` が glob で拾う）。
 * ⚠️ 既存の型は**上書きしない**（同名があればスキップ）。作り直したい時は手でファイルを消すこと。
 */

const DIR = 'src/stages';
const W = CONFIG.BOARD_WIDTH;
/** ゲートを置く段。⚠️ これより上へ戻さない（R2でひっくり返したバケツと重なる） */
const ROWS = [300, 410, 520];
/** ジャンプ台の幅の候補。⚠️ 壁に寄せた状態では幅がそのまま「当たりの広さ」になる */
const JUMPER_WIDTHS = [170, 120, 80];
/** 部品どうしの隙間 */
const GAP = 8;
/** レーン（仕切りで囲った細い道）の上端・下端。⚠️ 下げすぎると漏斗に食い込む */
const LANE_TOP = 290;
const LANE_BOTTOM = 532;
const LANE_WIDTHS = [80, 120];

const SEEDS = Number(process.env.STAGE_GEN_SEEDS ?? 60);
const KEEP = Number(process.env.STAGE_GEN_KEEP ?? 3);
const DRY = process.env.STAGE_GEN_DRY === '1';

/** 区間 [a,b] を count 枚に割る。⚠️ 最小幅と隙間を守り、**両端は必ず壁に接する** */
function splitSpans(rng: () => number, a: number, b: number, want: number): [number, number][] {
  const min = CONFIG.EDITOR_MIN_WIDTH;
  const total = b - a;
  // 入らない枚数を要求されたら減らす（細い破片はテストで弾かれる）
  let count = want;
  while (count > 1 && count * min + (count - 1) * GAP > total) count--;
  const extra = total - (count * min + (count - 1) * GAP);
  const weights = Array.from({ length: count }, () => rng() + 0.15);
  const sum = weights.reduce((s, w) => s + w, 0);
  const spans: [number, number][] = [];
  let x = a;
  for (let i = 0; i < count; i++) {
    const w = min + (extra * weights[i]) / sum;
    spans.push([Math.round(x), Math.round(x + w)]);
    x += w + GAP;
  }
  spans[spans.length - 1][1] = b; // ⚠️ 壁までいっぱいにする（貼り付いた玉が素通りしないように）
  return spans;
}

/**
 * 倍率を選ぶ。
 * ⚠️ **上の段で大きい倍率を引くと増えすぎる**（下の段まで全部増えた玉が通るため）。
 *    下の段ほど大きいものが出やすくする。
 */
function pickMult(rng: () => number, depth: number, rows: number): number {
  const table = depth === 0 ? [2, 2, 3] : depth === rows - 1 ? [3, 4, 4, 10] : [2, 3, 4];
  return table[Math.floor(rng() * table.length)];
}

interface Made {
  def: StageDef;
  label: string;
}

/** 種1つから完成した型を作る（形の決まりを最初から満たす形で作る） */
function generate(seed: number, index: number): Made {
  const rng = createRng(seed);
  // 2段は少なめ（3段の方が「狙う意味」を作りやすい）
  const rows = rng() < 0.25 ? 2 : 3;
  const ys = rows === 2 ? [ROWS[0], ROWS[2]] : ROWS;
  const bottomY = ys[ys.length - 1];

  // ジャンプ台は最下段の**壁ぎわ**。🔑 中央に置くと必ず「どこに落としても同じ」になる
  //    （V字の漏斗が玉を中央へ集めるので、中央の台が結局全部拾ってしまう・2026-07-25 実測）
  const side = rng() < 0.5 ? 'left' : 'right';
  const jw = JUMPER_WIDTHS[Math.floor(rng() * JUMPER_WIDTHS.length)];
  const [jx1, jx2] = side === 'left' ? [0, jw] : [W - jw, W];

  const gates: StageDef['gates'] = [];
  ys.forEach((y, depth) => {
    const want = 2 + Math.floor(rng() * 3); // 2〜4枚
    const [a, b] = y === bottomY ? (side === 'left' ? [jx2 + GAP, W] : [0, jx1 - GAP]) : [0, W];
    for (const [x1, x2] of splitSpans(rng, a, b, want)) {
      gates.push({ x1, x2, y, multiplier: pickMult(rng, depth, ys.length) });
    }
  });

  // レーン（仕切りで囲った細い道）。⚠️ 台に掛かる道は意味がない（道の下が台だと結局跳ねる）
  const dividers: StageDef['dividers'] = [];
  let laneLabel = 'レーン無し';
  if (rng() < 0.65) {
    const lw = LANE_WIDTHS[Math.floor(rng() * LANE_WIDTHS.length)];
    // 台の反対側に置く（台の無い側に「跳ねずに流れる道」を作るのが狙い）
    const room = side === 'left' ? [jx2 + GAP, W - lw] : [0, jx1 - GAP - lw];
    const x1 = Math.round(room[0] + rng() * Math.max(0, room[1] - room[0]));
    const x2 = x1 + lw;
    if (x2 <= W && (x2 <= jx1 || x1 >= jx2)) {
      dividers.push({ x1, y1: LANE_TOP, x2: x1, y2: LANE_BOTTOM });
      dividers.push({ x1: x2, y1: LANE_TOP, x2, y2: LANE_BOTTOM });
      laneLabel = `レーン x${x1}〜${x2}`;
    }
  }

  const name = `type-${String(index).padStart(2, '0')}-${side === 'left' ? 'l' : 'r'}${jw}${
    dividers.length ? 'lane' : ''
  }`;
  const def = normalizeStageDef({
    name,
    gates,
    jumpers: [{ x1: jx1, x2: jx2, y: bottomY }],
    dividers,
  });
  return { def, label: `${ys.length}段・台${side === 'left' ? '左' : '右'}幅${jw}・${laneLabel}` };
}

/** 下見の点数（本判定より粗く速い）。合格に近いほど高い。-1 は捨てる */
function screen(def: StageDef): number {
  const r = judge(def, { drops: [10, 180, 350], seeds: 1 });
  if (r.best < 700) return -1; // そもそも増えない案
  if (r.bestSecs > RUBRIC.SECS_MAX) return -1; // 長すぎ（暴走の芽）
  return Math.min(r.best, RUBRIC.BEST_MAX) * Math.min(r.spread, 6);
}

it('ゼロからステージを作る', () => {
  const rows: string[] = [
    `種 ${SEEDS} 個から作って、下見 → 本判定の順に落とす（保存する上限 ${KEEP} 型${DRY ? '・DRY=保存しない' : ''}）`,
    `合格条件: 当たり${RUBRIC.BEST_MIN}〜${RUBRIC.BEST_MAX}点 / ${RUBRIC.SECS_MIN}〜${RUBRIC.SECS_MAX}秒 / 差${RUBRIC.SPREAD_MIN}倍以上 / 狙える場所${RUBRIC.GOOD_COUNT_MIN}か所以上`,
    '',
  ];

  // 1. 種から作って下見にかける
  const scored: { made: Made; score: number }[] = [];
  for (let i = 0; i < SEEDS; i++) {
    const made = generate(1000 + i, 9 + i); // ⚠️ 既存は type-01〜08 なので 09 から
    const score = screen(made.def);
    if (score > 0) scored.push({ made, score });
  }
  scored.sort((a, b) => b.score - a.score);
  rows.push(`下見を通ったのは ${scored.length} / ${SEEDS} 個`, '');

  // 2. 上位から本判定にかけ、合格を集める（保存する数の3倍まで見る）
  const passed: Made[] = [];
  let tried = 0;
  for (const { made } of scored) {
    if (passed.length >= KEEP || tried >= KEEP * 4) break;
    tried++;
    const r = judge(made.def);
    rows.push(`${line(r)}\n       └ ${made.label}`);
    if (r.pass) passed.push(made);
  }
  rows.push('', `本判定 ${tried} 型 → 合格 ${passed.length} 型`);

  // 3. 合格だけ保存（⚠️ 既存ファイルは上書きしない）
  const saved: string[] = [];
  for (const m of passed) {
    const path = `${DIR}/${m.def.name}.json`;
    if (existsSync(path)) {
      rows.push(`⚠️ 同名があるのでスキップ: ${path}`);
      continue;
    }
    if (!DRY) writeFileSync(path, `${JSON.stringify(m.def, null, 2)}\n`, 'utf-8');
    saved.push(m.def.name);
  }
  rows.push(
    DRY ? `（DRY のため保存していない）候補: ${saved.join(' / ') || 'なし'}` : `保存: ${saved.join(' / ') || 'なし'}`,
  );

  const text = rows.join('\n');
  writeFileSync('stage-gen.txt', text, 'utf-8');
  console.log(text);
}, 1_800_000);
