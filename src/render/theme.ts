/**
 * 素材テーマ。世界観（木のおもちゃ工房）は固定で、盤面の素材と構造物の色だけ差し替える。
 *
 * ⚠️ ゲート・ジャンプ台・玉の色もここに置く。将来「スキン変更機能」で差し替える前提なので、
 *    描画側に色を直書きしないこと。
 */
export interface Material {
  key: string;
  /** 画面に出す名前（ハイスコアの記録にも使う） */
  name: string;
  /** public/assets 内の盤面画像ファイル名 */
  board: string;
  /** 傾斜板の色 */
  wedge: string;
  /** 傾斜板の上面のハイライト */
  wedgeTop: string;
  /** 盤面の外側の背景色 */
  outer: string;
}

export const MATERIALS: Material[] = [
  { key: 'wood',      name: 'マホガニー',     board: 'board-wood.png',      wedge: '#5a3f26', wedgeTop: '#b98953', outer: '#170f0a' },
  { key: 'cherry',    name: 'チェリー',       board: 'board-cherry.png',    wedge: '#6b4526', wedgeTop: '#c99a63', outer: '#170e09' },
  { key: 'bamboo',    name: '竹',             board: 'board-bamboo.png',    wedge: '#8a7440', wedgeTop: '#e0cf92', outer: '#11150e' },
  { key: 'walnut',    name: 'ウォールナット', board: 'board-walnut.png',    wedge: '#3a2718', wedgeTop: '#8f6d47', outer: '#0d0906' },
  { key: 'maple',     name: 'メープル',       board: 'board-maple.png',     wedge: '#a8895c', wedgeTop: '#f0dcb8', outer: '#181410' },
  { key: 'driftwood', name: '古材',           board: 'board-driftwood.png', wedge: '#6b6b66', wedgeTop: '#c2c2b8', outer: '#0f1113' },
];

/**
 * テーマ共通の色（機能色）。スキン機能を足すときはここを差し替え可能にする。
 * ⚠️ 描画側はゲート・ジャンプ台・玉・金具の色をここから引くこと。直書きしない。
 */
export const SKIN = {
  gate: '#3fe0a4',
  gateInk: '#04291d',
  gateGlow: 'rgba(63,224,164,.55)',
  jump: '#57c8ff',
  jumpInk: '#032539',
  jumpGlow: 'rgba(87,200,255,.5)',
  metal: '#e8c165',
  metalDark: '#8a6420',
  ballHi: '#ffffff',
  ballMid: '#eef3f7',
  ballLo: '#a9bac9',
} as const;

/**
 * 玉の見た目。工房で解放していく（2026-07-25）。
 * ⚠️ 一番よく見る物なので、報酬としての効きが一番大きい。色だけで別物に見える。
 */
export interface BallSkin {
  key: string;
  name: string;
  /** 中心のハイライト／中間／縁。`SKIN.ball*` と同じ役割 */
  hi: string;
  mid: string;
  lo: string;
}

export const BALL_SKINS: BallSkin[] = [
  { key: 'plain', name: 'ビー玉',       hi: '#ffffff', mid: '#eef3f7', lo: '#a9bac9' },
  { key: 'amber', name: '琥珀のビー玉', hi: '#fff6de', mid: '#f4c96c', lo: '#a06f1c' },
  { key: 'steel', name: '鋼のビー玉',   hi: '#ffffff', mid: '#c7d5df', lo: '#556777' },
  { key: 'glow',  name: '蛍のビー玉',   hi: '#ffffff', mid: '#a8ffe2', lo: '#2bb98f' },
];

export function findBallSkin(key: string): BallSkin {
  return BALL_SKINS.find((b) => b.key === key) ?? BALL_SKINS[0];
}

/**
 * rand は 0以上1未満を返す関数。1.0 が来ても範囲外にならないように締める。
 * ⚠️ `pool` は工房で解放済みのものだけを渡す（省くと全部から引く＝テスト用）。
 */
export function pickMaterial(rand: () => number, pool: Material[] = MATERIALS): Material {
  const list = pool.length > 0 ? pool : MATERIALS;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}
