import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { normalizeStageDef, type StageDef } from '../src/core/stageDef';
import { RUBRIC, judge, line, type StageReport } from './stageRubric';

/**
 * ステージを「決めた形」に組み直して、狙う意味のあるステージにする。`npm run stages:lane`
 *
 * ── 形の決まり（2026-07-25 れいあ指定）──
 *  1. ゲートは**最大3段**（300 / 410 / 520）
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
const ROWS = [300, 410, 520];
/**
 * ジャンプ台の幅の候補。最下段の約半分（type-01 は170）。
 * ⚠️ 2026-07-26 追加: **狭い幅も試す**。170固定だと `default` と `type-04` が
 *    どうやっても「差2倍以上」に届かなかった（22通り全部外れ）。
 *    ⚠️ 「幅では差がつかない」という実測(2026-07-25)は**台を中央に置いた場合**の話で、
 *       壁に寄せた状態で幅を変える組み合わせは試していなかった。
 */
const JUMPER_WIDTHS = [170, 120, 80];
/** 部品どうしの隙間 */
const GAP = 8;
/** レーンの上端・下端。⚠️ 下げすぎると漏斗に食い込む */
const LANE_TOP = 290;
const LANE_BOTTOM = 532;
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

/**
 * 段を**並び順で**付け替える。
 * ⚠️ 高さの近さで寄せてはいけない。段をまとめて下げた時に2段が同じ所へ潰れる
 *    （実測: 255/375 を 340/450 へ寄せようとして、375 が 340 に吸われた）。
 */
function rowMapper(def: StageDef): (y: number) => number {
  const from = [...new Set(def.gates.map((g) => g.y))].sort((a, b) => a - b);
  const to = from.length === 2 ? [ROWS[0], ROWS[ROWS.length - 1]] : ROWS.slice(0, from.length);
  return (y) => to[from.indexOf(y)] ?? y;
}

/** ゲートから区間 [a,b] を抜く。細くなりすぎた破片は捨てる */
function cut(g: StageDef['gates'][number], a: number, b: number): StageDef['gates'] {
  const out: StageDef['gates'] = [];
  if (g.x1 < a) out.push({ ...g, x2: Math.min(g.x2, a) });
  if (g.x2 > b) out.push({ ...g, x1: Math.max(g.x1, b) });
  return out.filter((x) => x.x2 - x.x1 >= CONFIG.EDITOR_MIN_WIDTH);
}

/**
 * 決まりの形に組み直す。
 * - 段を 300/410/520 へ並び順で付け替える（最大3段）
 * - ジャンプ台を最下段へ上げ、指定した壁にぴったり寄せる
 * - 最下段のゲートからジャンプ台のぶんを抜く（＝横並びのタイルにする）
 */
function tidy(def: StageDef, side: (typeof SIDES)[number], jw: number): StageDef {
  const toRow = rowMapper(def);
  const gates = def.gates.map((g) => ({ ...g, y: toRow(g.y) }));
  const bottomY = Math.max(...gates.map((g) => g.y));
  const [x1, x2] = side === 'left' ? [0, jw] : [W - jw, W];
  const kept = gates.flatMap((g) => (g.y === bottomY ? cut(g, x1 - GAP, x2 + GAP) : [g]));

  // ⚠️ 最下段がジャンプ台だけになったら、台の反対側にゲートを1枚立て直す。
  //    ここを抜くと「最下段のゲートの1つとして台を置く」形が崩れる
  //    （実測: 一度整えた型にもう一度かけると、細くなった破片が捨てられて最下段が空になった）。
  if (!kept.some((g) => g.y === bottomY)) {
    const mult = gates.find((g) => g.y === bottomY)?.multiplier ?? 4;
    kept.push(
      side === 'left'
        ? { x1: x2 + GAP, x2: W, y: bottomY, multiplier: mult }
        : { x1: 0, x2: x1 - GAP, y: bottomY, multiplier: mult },
    );
  }

  return { ...def, gates: kept, jumpers: [{ ...def.jumpers[0], x1, x2, y: bottomY }] };
}

/**
 * 仕切りで囲った細い道を1本入れる。⚠️ 道の下がジャンプ台では意味がない。
 *
 * 🔴 **未対応＝この関数は仕切りを足すだけで、ゲートを切っていない**。
 *    れいあ指定（2026-07-26）「**仕切りとゲートは極力重ならないようにしてほしい**」に反する型ができる
 *    （実測: この道具が直した type-02/03/04 は 2〜4か所で交差していた。
 *     れいあが手で作った type-01 は交差0）。
 *    ⚠️ **この道具を回す前に、ここを `stage-gen.test.ts` の `splitAtLane` と同じ形に直すこと。**
 *    直さずに回すと交差した型がまた増える。
 */
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
  const r = judge(def, { drops: [10, 180, 350], seeds: 1 });
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
    for (const jw of JUMPER_WIDTHS) {
      const t = tidy(base, side, jw);
      const wall = side === 'left' ? '左端' : '右端';
      out.push({ label: `台${wall}幅${jw}・レーン無し`, def: t });
      for (const w of LANE_WIDTHS) {
        for (const x of LANE_STARTS) {
          const def = withLane(t, x, x + w);
          if (def) out.push({ label: `台${wall}幅${jw}・レーン x${x}〜${x + w}`, def });
        }
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

    /**
     * 良さの順位。
     * ⚠️ 合格が無い時に「スコアが高い方」を選んではいけない。**一番暴走している案**が選ばれる
     *    （実測: type-05 で 13,878点・228秒 の案が採用された）。落ちた理由の数が少なく、
     *    当たりのスコアが真ん中に近いものを選ぶ。
     */
    const rank = (r: StageReport): number =>
      r.pass
        ? 1e9 + r.best
        : -r.ng.length * 1e6 - Math.abs(r.best - (RUBRIC.BEST_MIN + RUBRIC.BEST_MAX) / 2);

    let best: (Cand & { r: StageReport }) | null = null;
    for (const c of short) {
      const r = judge(c.def);
      if (!best || rank(r) > rank(best.r)) best = { ...c, r };
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
