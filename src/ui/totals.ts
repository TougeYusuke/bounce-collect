/**
 * 疑似トータルランキング（フェーズ1・ローカル完結）。
 *
 * 全プレイの累積スコアを貯め、内部に固定で持つ架空プレイヤーの中で自分が何位かを出す。
 * ⚠️ サーバーには送らない＝改ざんされても自分の端末内だけ。だから bot 対策は不要（フェーズ2で共有するなら要る）。
 *
 * 値のカーブは「最初は最下位・遊ぶたび1〜2個ずつ上がる」を狙って置いた。
 * 下位（Sprout/Pebble/Acorn）は数ラウンドで抜ける手の届く値、上位は遠い憧れの値。
 * 実際の手触りは実機で見て調整する前提。
 */
export interface Rival {
  name: string;
  total: number;
}

/**
 * ⚠️ 値は「1回のプレイで約18,000点」を前提に組んである（2026-07-24 実測）。
 *    スコアを weight 合計から**回収した玉の個数**に変えた時に桁を作り直した。
 *    狙い＝1回目で下2人を抜き、そこから1〜2人ずつ上がる。てっぺんは100回ぶん。
 *    ⚠️ スコアの出方を変えたら、ここも必ず作り直すこと（放置すると永久に最下位になる）。
 */
export const RIVALS: Rival[] = [
  { name: 'Woodmaster', total: 2_000_000 },
  { name: 'MarbleKing', total: 1_200_000 },
  { name: 'Cascade', total: 720_000 },
  { name: 'PinballPete', total: 430_000 },
  { name: 'Tumbler', total: 260_000 },
  { name: 'BrassHoop', total: 155_000 },
  { name: 'Knothole', total: 92_000 },
  { name: 'Sawdust', total: 55_000 },
  { name: 'Splinter', total: 33_000 },
  { name: 'Acorn', total: 20_000 },
  { name: 'Pebble', total: 11_000 },
  { name: 'Sprout', total: 5_000 },
];

const KEY = 'marble-mill.total';

export interface RankRow {
  name: string;
  total: number;
  isMe: boolean;
}

export function getTotal(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** 1ラウンドぶんのスコアを累積に足す */
export function addTotal(score: number): void {
  try {
    localStorage.setItem(KEY, String(getTotal() + Math.max(0, Math.floor(score))));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}

/** 架空プレイヤー＋自分を累積で降順に並べる */
export function totalRanking(): RankRow[] {
  const me: RankRow = { name: 'YOU', total: getTotal(), isMe: true };
  const rows: RankRow[] = [...RIVALS.map((r) => ({ ...r, isMe: false })), me];
  return rows.sort((a, b) => b.total - a.total);
}

/** 自分の順位（1始まり） */
export function myTotalRank(): number {
  return totalRanking().findIndex((r) => r.isMe) + 1;
}
