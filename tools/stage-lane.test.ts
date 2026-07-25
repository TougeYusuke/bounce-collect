import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { normalizeStageDef, type StageDef } from '../src/core/stageDef';
import { RUBRIC, judge, line, type StageReport } from './stageRubric';

/**
 * ステージを「決めた形」に組み直して、狙う意味のあるステージにする。`npm run stages:lane`
 *
 * ── 形の決まり（2026-07-25 れいあ指定）──
 *  1. ゲートは**最大3段**（255 / 375 / 500）
 *  2. ジャンプ台は**最下段に1つだけ**
 *  3. ジャンプ台は**最下段のゲートの1つ**として置く（同じ高さに横並び・重ねない）
 *
 * 🔑 狙う意味の作り方（type-01 から読み取った・2026-07-25 実測）:
 *    ジャンプ台の**幅では差がつかない**。V字の漏斗が全ステージ共通で、どこに落ちた玉も
 *    最後は中央へ集まってしまうため。差をつけているのは**仕切りで囲った細い道**で、
 *    その道の下がジャンプ台ではなくゲートであること。そこへ落ちた玉は一度も跳ねずに流れる。
 *
 * ⚠️ type-01 は触らない（れいあの手調整）。
 */

const DIR = 'src/stages';
const W = CONFIG.BOARD_WIDTH;
/** ゲートを置く段。⚠️ これより上へ戻さない（R2のバケツと重なる） */
const ROWS = [255, 375, 500];
/** ジャンプ台の幅。最下段の約半分（type-01 は170） */
const JUMPER_WIDTH = 170;
/** 部品どうしの隙間 */
const GAP = 8;
/** レーンの上端・下端。⚠️ 下げすぎると漏斗に食い込む */
const LANE_TOP = 250;
const LANE_BOTTOM = 512;
/** レーンの幅（玉5個ぶんくらい）。狭いと詰まり、広いと当たりの場所が無くなる */
const LANE_WIDTHS = [80, 120];
const LANE_STARTS = [40, 90, 140, 190, 240];
/**
 * ジャンプ台を寄せる壁。
 * 🔑 **中央に置くと必ず「どこに落としても同じ」になる**（2026-07-25 実測）。
 *    V字の漏斗が玉を中央へ集めるので、中央の台は結局全部拾ってしまう。
 *    壁に寄せると反対側が本当に「台の無い側」になり、狙いを外した時に伸びなくなる。
 *    実測: 台を壁に寄せた type-02(左) と type-04(右) だけ合格し、中央寄せの4型は全部 1.1倍だった。
 */
const SIDES = ['left', 'right'] as const;

/**
 * 直したい型。⚠️ type-01 は入れない（れいあの手調整）。
 * ⚠️ 1型だけ直したい時は `STAGE_LANE_ONLY=type-06-zigzag npm run stages:lane`。
 *    その時は**必ず先に `git checkout -- src/stages/<型>.json` で戻す**
 *    （2回かけると仕切りが二重に増える）。
 */
const ALL_TARGETS = [
  'type-02-wide-top',
  'type-03-sparse',
  'type-04-tall-post',
  'type-05-center-jump',
  'type-06-zigzag',
  'type-07-cascade',
  'type-08-compact',
];
const only = process.env.STAGE_LANE_ONLY;
const TARGETS = only ? only.split(',') : ALL_TARGETS;

const load = (name: string): StageDef =>
  normalizeStageDef(JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf-8')));
const save = (name: string, def: StageDef): void =>
  writeFileSync(`${DIR}/${name}.json`, `${JSON.stringify(def, null, 2)}\n`, 'utf-8');

const nearestRow = (y: number): number =>
  ROWS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));

/** ゲートから区間 [a,b] を抜く。細くなりすぎた破片は捨てる */
function cut(g: StageDef['gates'][number], a: number, b: number): StageDef['gates'] {
  const out: StageDef['gates'] = [];
  if (g.x1 < a) out.push({ ...g, x2: Math.min(g.x2, a) });
  if (g.x2 > b) out.push({ ...g, x1: Math.max(g.x1, b) });
  return out.filter((x) => x.x2 - x.x1 >= CONFIG.EDITOR_MIN_WIDTH);
}

/**
 * 決まりの形に組み直す。
 * - 段を 255/375/500 のいちばん近いところへ寄せる（最大3段）
 * - ジャンプ台を最下段へ上げ、指定した壁にぴったり寄せる
 * - 最下段のゲートからジャンプ台のぶんを抜く（＝横並びのタイルにする）
 */
function tidy(def: StageDef, side: (typeof SIDES)[number]): StageDef {
  const gates = def.gates.map((g) => ({ ...g, y: nearestRow(g.y) }));
  const bottomY = Math.max(...gates.map((g) => g.y));
  const [x1, x2] = side === 'left' ? [0, JUMPER_WIDTH] : [W - JUMPER_WIDTH, W];

  return {
    ...def,
    gates: gates.flatMap((g) => (g.y === bottomY ? cut(g, x1 - GAP, x2 + GAP) : [g])),
    jumpers: [{ ...def.jumpers[0], x1, x2, y: bottomY }],
  };
}

/** 仕切りで囲った細い道を1本入れる。⚠️ 道の下がジャンプ台では意味がない */
function withLane(def: StageDef, x1: number, x2: number): StageDef | null {
  const j = def.jumpers[0];
  if (!j || (x1 < j.x2 && x2 > j.x1)) return null; // 台に掛かる道は無効
  const mid = (d: StageDef['dividers'][number]) => (d.x1 + d.x2) / 2;
  return {
    ...def,
    dividers: [
      ...def.dividers.filter((d) => mid(d) <= x1 + 4 || mid(d) >= x2 - 4),
      { x1, y1: LANE_TOP, x2: x1, y2: LANE_BOTTOM },
      { x1: x2, y1: LANE_TOP, x2, y2: LANE_BOTTOM },
    ],
  };
}

/** 下見の点数（本判定より粗く速い）。合格に近いほど高い */
function screen(def: StageDef): number {
  const r = judge(def, { drops: [90, 230, 370], seeds: 1 });
  if (r.best < 700) return -1; // そもそも増えない案は捨てる
  return Math.min(r.best, 1800) * Math.min(r.spread, 6);
}

interface Cand {
  label: string;
  def: StageDef;
}

/** 1つの型について、置き方の候補を並べる（台を寄せる壁 × レーンの有無/位置） */
function candidates(base: StageDef): Cand[] {
  const out: Cand[] = [];
  for (const side of SIDES) {
    const t = tidy(base, side);
    const wall = side === 'left' ? '左端' : '右端';
    out.push({ label: `台${wall}・レーン無し`, def: t });
    for (const w of LANE_WIDTHS) {
      for (const x of LANE_STARTS) {
        const def = withLane(t, x, x + w);
        if (def) out.push({ label: `台${wall}・レーン x${x}〜${x + w}`, def });
      }
    }
  }
  return out;
}

it('形を揃えて、いちばん良い置き方を探す', () => {
  const log: string[] = [];
  let ok = 0;
  for (const name of TARGETS) {
    const base = load(name);
    const before = judge(base);

    // 下見で粗く絞ってから、上位3件だけ本判定にかける（本判定は1件20秒かかる）
    const short = candidates(base)
      .map((c) => ({ ...c, s: screen(c.def) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);

    let best: (Cand & { r: StageReport }) | null = null;
    for (const c of short) {
      const r = judge(c.def);
      if (!best || (r.pass && !best.r.pass) || (r.pass === best.r.pass && r.best > best.r.best)) {
        best = { ...c, r };
      }
    }
    if (!best) {
      log.push(`不可 ${name}: 置ける形が無かった（そのまま）`);
      continue;
    }
    if (best.r.pass) ok++;
    save(name, best.def);
    log.push(`${best.r.pass ? '合格' : '不可'} ${name}: ${best.label}`);
    log.push(`  前 ${line(before)}`);
    log.push(`  後 ${line(best.r)}`);
  }

  const text = [
    `合格条件: 差${RUBRIC.SPREAD_MIN}倍以上ほか ／ 合格 ${ok}/${TARGETS.length}`,
    '',
    ...log,
  ].join('\n');
  writeFileSync('stage-lane.txt', text, 'utf-8');
  console.log(text);
}, 3_600_000);
