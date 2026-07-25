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
  /** 中心のハイライト／中間／縁 */
  hi: string;
  mid: string;
  lo: string;
  /**
   * 複数色（マーブル）。入れると**玉ごとに色が変わる**（玉の番号で振り分ける）。
   * ⚠️ 焼くスプライトが色数ぶん増える。増やしすぎない（色数ぶん drawImage の元が増える）。
   */
  palette?: { hi: string; mid: string; lo: string }[];
  /**
   * 見た目の形。⚠️ **当たり判定は常に円**（れいあ指定「当たり判定は今のままでいい」）。
   * ここは絵だけの話なので、星でも物理は丸のまま。
   */
  shape?: 'circle' | 'star' | 'squircle' | 'heart' | 'hex';
  /** 模様 */
  pattern?: 'none' | 'baseball' | 'coin';
  /** 模様に使う色（縫い目など） */
  accent?: string;
}

/** 五色。⚠️ 盤面の木の色に負けないよう彩度を落としすぎない。複数のスキンで使い回す */
const FIVE = [
  { hi: '#fff1f2', mid: '#f68ea0', lo: '#a3324a' },
  { hi: '#eefaff', mid: '#7fc4ef', lo: '#2b5f88' },
  { hi: '#f3ffe9', mid: '#a3d97a', lo: '#3f7a2a' },
  { hi: '#fff9e2', mid: '#f5cf6a', lo: '#9b7314' },
  { hi: '#f8f0ff', mid: '#c39bef', lo: '#5b3390' },
];

export const BALL_SKINS: BallSkin[] = [
  { key: 'plain', name: 'ビー玉',       hi: '#ffffff', mid: '#eef3f7', lo: '#a9bac9' },
  { key: 'amber', name: '琥珀のビー玉', hi: '#fff6de', mid: '#f4c96c', lo: '#a06f1c' },
  {
    key: 'marble',
    name: '五色マーブル',
    hi: '#ffffff', mid: '#eef3f7', lo: '#a9bac9',
    palette: FIVE,
  },
  {
    key: 'baseball',
    name: '野球ボール',
    hi: '#ffffff', mid: '#f4f1ea', lo: '#b9b2a4',
    pattern: 'baseball',
    accent: '#c8362f',
  },
  { key: 'steel', name: '鋼のビー玉',   hi: '#ffffff', mid: '#c7d5df', lo: '#556777' },
  {
    key: 'star',
    name: '星のかけら',
    hi: '#fffdf0', mid: '#ffd85e', lo: '#c08a10',
    shape: 'star',
  },
  { key: 'glow',  name: '蛍のビー玉',   hi: '#ffffff', mid: '#a8ffe2', lo: '#2bb98f' },
  { key: 'heart', name: 'ハート',       hi: '#fff0f3', mid: '#ff7d97', lo: '#a81f3c', shape: 'heart' },
  { key: 'hex',   name: '六角ガラス',   hi: '#f2ffff', mid: '#8fe4e0', lo: '#2b7f7c', shape: 'hex' },
  {
    key: 'coin',
    name: '金貨',
    hi: '#fff8d8', mid: '#f0c04a', lo: '#8f6412',
    pattern: 'coin',
    accent: '#7d5410',
  },
  // ⚠️ 形とパレットは自由に組める（形＝shape／色＝palette は別の軸）
  { key: 'star-mix',  name: '五色の星',     hi: '#fffdf0', mid: '#ffd85e', lo: '#c08a10', shape: 'star',  palette: FIVE },
  { key: 'heart-mix', name: '五色のハート', hi: '#fff0f3', mid: '#ff7d97', lo: '#a81f3c', shape: 'heart', palette: FIVE },
];

/**
 * 玉を入れる器（上のカップ／下の受け皿）の見た目。
 *
 * 🔑 **木製にこだわらない**（2026-07-25 れいあ方針「タンブラーとか、それこそ鉄のバケツとか」）。
 * 🔑 **画像は増やさない**。`form` で輪郭を、色で素材感を出して `render/vesselArt.ts` が描く。
 *    種類を足すたびに画像を用意する形にすると、増やすほど手間が増える（型のサムネイルをやめたのと同じ）。
 * ⚠️ `form: 'image'` だけは既存の `bucket-wood.png` を使う（看板の見た目なので残す）。
 */
export interface BucketSkin {
  key: string;
  name: string;
  /** 輪郭。`image` は既存の木のバケツ画像 */
  form: 'image' | 'barrel' | 'pail' | 'tumbler' | 'mug' | 'glass';
  /** 胴の色／陰／縁・たが／口の内側 */
  body: string;
  shade: string;
  rim: string;
  inner: string;
}

export const BUCKET_SKINS: BucketSkin[] = [
  { key: 'wood', name: '木のバケツ', form: 'image', body: '#b5814a', shade: '#7a5228', rim: '#e8c165', inner: '#4a2f14' },
  { key: 'iron', name: '鉄のバケツ', form: 'pail', body: '#8d949c', shade: '#4a5058', rim: '#d3dae1', inner: '#23282e' },
  { key: 'copper', name: '銅のバケツ', form: 'pail', body: '#c97a4a', shade: '#7d4425', rim: '#f0b07a', inner: '#3a1e10' },
  { key: 'tumbler', name: 'タンブラー', form: 'tumbler', body: '#b9c3cc', shade: '#6d7883', rim: '#eef3f7', inner: '#2a3138' },
  { key: 'mug', name: 'マグカップ', form: 'mug', body: '#f2f4f7', shade: '#c3cbd4', rim: '#8fb7d6', inner: '#5d6a76' },
  { key: 'glass', name: 'ガラスのコップ', form: 'glass', body: '#cfeaf5', shade: '#8fbccd', rim: '#eafaff', inner: '#5e8b9c' },
  { key: 'jade', name: '翡翠の壺', form: 'barrel', body: '#5cbfa0', shade: '#2f7d67', rim: '#bff0e0', inner: '#164034' },
];

export function findBucketSkin(key: string): BucketSkin {
  return BUCKET_SKINS.find((b) => b.key === key) ?? BUCKET_SKINS[0];
}

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
