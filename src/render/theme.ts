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
  /**
   * 見た目の大きさ（当たり判定の半径の何倍で描くか）。
   * 🔑 **星やハートは円に内接するので、そのまま描くと盤面がスカスカに見える**
   *    （2026-07-25 れいあ指摘）。当たり判定より**大きく描いて**詰まって見せる。
   * ⚠️ 当たり判定は変わらない＝物理はそのまま。隣と重なって見えるが、それが「ギチギチ感」。
   */
  scale?: number;
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
    scale: 1.5,
  },
  { key: 'glow',  name: '蛍のビー玉',   hi: '#ffffff', mid: '#a8ffe2', lo: '#2bb98f' },
  { key: 'heart', name: 'ハート',       hi: '#fff0f3', mid: '#ff7d97', lo: '#a81f3c', shape: 'heart', scale: 1.4 },
  { key: 'hex',   name: '六角ガラス',   hi: '#f2ffff', mid: '#8fe4e0', lo: '#2b7f7c', shape: 'hex', scale: 1.15 },
  {
    key: 'coin',
    name: '金貨',
    hi: '#fff8d8', mid: '#f0c04a', lo: '#8f6412',
    pattern: 'coin',
    accent: '#7d5410',
    scale: 1.08,
  },
  // ⚠️ 形とパレットは自由に組める（形＝shape／色＝palette は別の軸）
  { key: 'star-mix',  name: '五色の星',     hi: '#fffdf0', mid: '#ffd85e', lo: '#c08a10', shape: 'star',  palette: FIVE, scale: 1.5 },
  { key: 'heart-mix', name: '五色のハート', hi: '#fff0f3', mid: '#ff7d97', lo: '#a81f3c', shape: 'heart', palette: FIVE, scale: 1.4 },
];

/**
 * 玉を入れる器（上のカップ／下の受け皿）の見た目。
 *
 * 🔑 **木製にこだわらない**（2026-07-25 れいあ方針「タンブラーとか、それこそ鉄のバケツとか」）。
 * 🔑 **画像で持つ**（2026-07-25 れいあ判断「バケツについては画像生成したほうがいい。
 *    今の状態だと少し見た目的に違和感がある」）。輪郭を手で描いた版は**フォールバック**として残す
 *    ＝画像が読めなくてもゲームは動く（`render/art.ts` の方針と同じ）。
 *
 * ⚠️ **`mouthY` と `mouthW` は画像から実測した値**。ここがズレると玉が器の外から出るように見える。
 *    測り方＝アルファの上端から「口のリングがいちばん広くなる行」を探す（`mockup/vessels/` の作業ログ参照）。
 *    ⚠️ 画像を差し替えたら必ず測り直すこと。
 */
export interface BucketSkin {
  key: string;
  name: string;
  /** 画像ファイル名（`public/assets/`）。無ければ `form` で手描きにフォールバック */
  image?: string;
  /** 口の中心が画像の高さの何割の位置にあるか */
  mouthY?: number;
  /** 口の幅が画像の幅の何割か（壺やマグは胴より口が狭い） */
  mouthW?: number;
  /** 手描きフォールバックの輪郭 */
  form: 'image' | 'barrel' | 'pail' | 'tumbler' | 'mug' | 'glass';
  /** 胴の色／陰／縁・たが／口の内側（手描き用。プレビューの下地にも使う） */
  body: string;
  shade: string;
  rim: string;
  inner: string;
}

export const BUCKET_SKINS: BucketSkin[] = [
  { key: 'wood', name: '木のバケツ', image: 'bucket-wood.png', mouthY: 0.168, mouthW: 1.0, form: 'barrel', body: '#b5814a', shade: '#7a5228', rim: '#e8c165', inner: '#4a2f14' },
  { key: 'iron', name: '鉄のバケツ', image: 'bucket-iron.png', mouthY: 0.106, mouthW: 1.0, form: 'pail', body: '#8d949c', shade: '#4a5058', rim: '#d3dae1', inner: '#23282e' },
  { key: 'copper', name: '銅のバケツ', image: 'bucket-copper.png', mouthY: 0.113, mouthW: 1.0, form: 'pail', body: '#c97a4a', shade: '#7d4425', rim: '#f0b07a', inner: '#3a1e10' },
  { key: 'tumbler', name: 'タンブラー', image: 'bucket-tumbler.png', mouthY: 0.08, mouthW: 1.0, form: 'tumbler', body: '#b9c3cc', shade: '#6d7883', rim: '#eef3f7', inner: '#2a3138' },
  { key: 'mug', name: 'マグカップ', image: 'bucket-mug.png', mouthY: 0.094, mouthW: 0.689, form: 'mug', body: '#f2f4f7', shade: '#c3cbd4', rim: '#8fb7d6', inner: '#5d6a76' },
  { key: 'glass', name: 'ガラスのコップ', image: 'bucket-glass.png', mouthY: 0.089, mouthW: 1.0, form: 'glass', body: '#cfeaf5', shade: '#8fbccd', rim: '#eafaff', inner: '#5e8b9c' },
  { key: 'jade', name: '翡翠の壺', image: 'bucket-jade.png', mouthY: 0.11, mouthW: 0.718, form: 'barrel', body: '#5cbfa0', shade: '#2f7d67', rim: '#bff0e0', inner: '#164034' },
];

/** 読み込む器の画像ファイル一覧 */
export const BUCKET_IMAGES: string[] = BUCKET_SKINS.map((b) => b.image).filter(
  (v): v is string => !!v,
);

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
