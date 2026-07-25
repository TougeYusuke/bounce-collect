import { UNLOCKS, nextUnlock, unlockProgress } from '../core/workshop';
import { loadScores, type ScoreEntry } from './scores';
import { getTotal, myTotalRank, totalRanking } from './totals';

/**
 * 画面遷移。表示状態を持つのはここだけに閉じ込める。
 * 'play' は「何も被せない」状態＝全オーバーレイを消すだけ。
 */
export type ScreenName = 'title' | 'play' | 'result' | 'scores' | 'total' | 'workshop';

const IDS: Record<Exclude<ScreenName, 'play'>, string> = {
  title: 'screen-title',
  result: 'screen-result',
  scores: 'screen-scores',
  total: 'screen-total',
  workshop: 'screen-workshop',
};

let current: ScreenName = 'title';

export function getScreen(): ScreenName {
  return current;
}

export function showScreen(name: ScreenName): void {
  current = name;
  for (const [key, id] of Object.entries(IDS)) {
    (document.getElementById(id) as HTMLDivElement).hidden = key !== name;
  }
}

/** 「2026-07-24」→「07-24」 */
function shortDate(d: string): string {
  return d.length >= 10 ? d.slice(5) : d;
}

/** ランキングの行を組む。markIndex の行だけ強調する（-1 で強調なし） */
function rankRows(entries: ScoreEntry[], markIndex: number, limit: number): string {
  const list = entries.slice(0, limit);
  if (list.length === 0) {
    return '<div class="rank-empty">まだ記録がないよ。1回遊んでみよ！</div>';
  }
  return list
    .map((e, i) => {
      const me = i === markIndex ? ' me' : '';
      return (
        `<div class="rank-row${me}">` +
        `<div class="no">${i + 1}</div>` +
        `<div class="v">${e.score.toLocaleString('ja-JP')}</div>` +
        `<div class="d">${e.material}・${shortDate(e.date)}</div>` +
        `</div>`
      );
    })
    .join('');
}

/** タイトル画面のハイスコアTOP5を描く */
export function renderTitleScores(): void {
  const el = document.getElementById('title-hs-list') as HTMLElement;
  el.innerHTML = rankRows(loadScores(), -1, 5);
}

/** ハイスコア一覧（全件）を描く */
export function renderScoresList(): void {
  const el = document.getElementById('scores-list') as HTMLElement;
  el.innerHTML = rankRows(loadScores(), -1, loadScores().length || 1);
}

/** 「TOTAL 1,234,567」と「世界 #12」を要素にセットする（タイトルとリザルトで共用） */
function fillTotal(valId: string, rankId: string): void {
  (document.getElementById(valId) as HTMLElement).textContent =
    getTotal().toLocaleString('ja-JP');
  (document.getElementById(rankId) as HTMLElement).textContent = `世界 #${myTotalRank()}`;
}

/** タイトルの添えトータル行を更新する */
export function renderTitleTotal(): void {
  fillTotal('title-total-val', 'title-total-rank');
}

/** トータルランキング（架空プレイヤー＋自分）を描く */
export function renderTotalRanking(): void {
  const rows = totalRanking()
    .map((r, i) => {
      const me = r.isMe ? ' me' : '';
      return (
        `<div class="rank-row${me}">` +
        `<div class="no">${i + 1}</div>` +
        `<div class="v">${r.name}</div>` +
        `<div class="d" style="font-size:14px">${r.total.toLocaleString('ja-JP')}</div>` +
        `</div>`
      );
    })
    .join('');
  (document.getElementById('total-list') as HTMLElement).innerHTML = rows;
}

/**
 * リザルトを描いて表示する。
 * @param score 今回のスコア
 * @param rank  ハイスコア内での順位（0始まり・圏外は-1）。0 のとき NEW RECORD を出す
 */
export function renderResult(score: number, rank: number): void {
  (document.getElementById('result-score') as HTMLElement).textContent =
    score.toLocaleString('ja-JP');
  (document.getElementById('result-badge') as HTMLElement).hidden = rank !== 0;
  (document.getElementById('result-list') as HTMLElement).innerHTML = rankRows(
    loadScores(),
    rank,
    5,
  );
  // 累積スコアはこの時点で加算済み（main の loop 参照）。ここでは表示するだけ
  fillTotal('result-total-val', 'result-total-rank');
  showScreen('result');
}

/**
 * 工房。解放済み／未解放を一覧で見せる。
 *
 * 🔑 **埋まっていく過程が見えること自体が報酬**（2026-07-25 れいあ方針
 *    「視覚的な楽しさをベースに、やればやるだけ楽しくなる仕組み」）。
 *    だから未解放も伏せずに並べる＝「次に何が来るか」が常に見える。
 * ⚠️ 解放の状態は保存していない。累計スコアから毎回計算する（`core/workshop.ts`）。
 */
export function renderWorkshop(): void {
  const total = getTotal();
  const { done, all } = unlockProgress(total);
  const next = nextUnlock(total);

  const top = document.getElementById('workshop-top') as HTMLElement;
  top.innerHTML =
    `<div class="ws-total"><span class="ws-k">貯まったビー玉</span>` +
    `<span class="ws-v">${total.toLocaleString('ja-JP')}</span></div>` +
    `<div class="ws-next">${
      next
        ? `次は「${next.name}」まで あと <b>${(next.cost - total).toLocaleString('ja-JP')}</b>`
        : 'ぜんぶ解放したよ！'
    }</div>` +
    `<div class="ws-prog">${done} / ${all}</div>`;

  const KIND: Record<string, string> = { ball: '玉', theme: '素材', stage: '型' };
  const list = document.getElementById('workshop-list') as HTMLElement;
  list.innerHTML = UNLOCKS.map((u) => {
    const got = total >= u.cost;
    return (
      `<div class="rank-row${got ? ' me' : ' locked'}">` +
      `<div class="no">${KIND[u.kind]}</div>` +
      `<div class="v">${u.name}</div>` +
      `<div class="d">${got ? '解放済み' : `${u.cost.toLocaleString('ja-JP')} で解放`}</div>` +
      `</div>`
    );
  }).join('');
}
