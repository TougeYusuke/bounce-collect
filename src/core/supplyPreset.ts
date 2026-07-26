import { CONFIG } from './config';

/**
 * 「盤面をどれだけ満杯に保つか」の実験用プリセット（`?debug=1` の時だけ切り替えられる）。
 *
 * 由来: れいあ判定 2026-07-26「玉が増えて盛り上がる感じがまだ物足りない」（**3回目の同じ指摘**）。
 * 過去2回はツマミを1個ずつ動かして見せて、どちらも「違いが判らなかった」で終わっている。
 * `npm run stages:supply` の総当たり（16通り）で分かったのは:
 *
 * 🔑 **「ずっと満杯」は作れる。ただしラウンドが1分弱 → 6分になる。**
 *    満杯率と今のテンポは構造的に両立しない（合格条件 95秒/3200点 を満たすのは今の設定だけだった）。
 *
 * だから数字で決めずに**実機で3つ触って選んでもらう**ための仕掛け。
 *
 * ## 選定の結果（2026-07-26 れいあ実機）
 *
 * - 採用＝**中間**（間隔 0.55 → 0.5）。全振りは「本家の絵」に一番近いが通し13分で不採用。
 * - 🔑 **同時に分かった本丸＝れいあが見たいのは「密度」ではなく「B 隆起」**
 *   （＝玉が増えた瞬間に山がボコッと持ち上がる動き）。
 *   ⚠️ **ここを取り違えたまま3回調整していた**（7/25に2回・7/26に1回）。
 *   密度は隆起の前提（詰まっていないと押し上げが起きない）だが、密度を上げただけでは解決しない。
 *   次に触るのは隆起の**見え方**＝`SPAWN_GROW_FRAMES`（押しのける速さ）と、増えた瞬間の演出。
 *
 * ⚠️ 足場は残してある（`a` を現行、`b` を選定前の設定にした）＝隆起の調整で振り直せるように。
 *    不要になったらこのファイルごと消すこと。
 */
export interface SupplyPreset {
  key: string;
  name: string;
  /** 実測値（`supply-report.txt`・3型の平均） */
  hint: string;
  /** 出口の広さ（玉何個ぶん）。狭いほど盤面に溜まる */
  outlet: number;
  /** 玉を生む時の最小間隔。⚠️ 0.45 で暴走を実測済み（2026-07-25）。0.5 より下げない */
  clearance: number;
  /** 押し上げでゲートを再利用できる回数 */
  pushUps: number;
  /** 生まれた玉が当たり判定を持つまでのフレーム数。短いほど周りを強く押しのける */
  grow: number;
}

/**
 * ⚠️ hint の時間は **R1 + R2 の通し**。R2の配り切りは玉数 ÷ 60個/秒（物理的な天井）なので、
 *    点が増えるとそのぶん後ろも伸びる。R1の秒だけ見せると全振りの重さが伝わらない。
 */
export const SUPPLY_PRESETS: readonly SupplyPreset[] = [
  { key: 'a', name: 'いま', hint: '満杯26% ・ 通し約2分15秒 ・ 4,051点', outlet: 3, clearance: 0.5, pushUps: 3, grow: 5 },
  { key: 'b', name: '前のまま', hint: '満杯8% ・ 通し約1分50秒 ・ 3,171点', outlet: 3, clearance: 0.55, pushUps: 3, grow: 5 },
  { key: 'c', name: '全振り', hint: '満杯95% ・ 通し約13分（4×で3分半）・ 24,052点', outlet: 2, clearance: 0.5, pushUps: 6, grow: 3 },
] as const;

export const DEFAULT_SUPPLY_KEY = 'a';

/** 知らないキーは既定に落とす（保存を信じない・速さの保持と同じ作法） */
export function resolveSupplyKey(key: string | null): string {
  return SUPPLY_PRESETS.some((p) => p.key === key) ? (key as string) : DEFAULT_SUPPLY_KEY;
}

export function supplyPreset(key: string): SupplyPreset {
  const k = resolveSupplyKey(key);
  return SUPPLY_PRESETS.find((p) => p.key === k)!;
}

/**
 * ツマミを当てる。
 * ⚠️ **Session / Stage を作る前に呼ぶこと**。`OUTLET_BALLS` は `buildStage`、
 *    `SPAWN_GROW_FRAMES` は Session の構築時にしか読まれない
 *    （2026-07-25 に「モジュール読み込み時に固定されていて振っても効かない」罠を踏んでいる）。
 * ⚠️ `CONFIG` は `as const` だが実行時はただのオブジェクト。
 */
export function applySupplyPreset(key: string): SupplyPreset {
  const p = supplyPreset(key);
  const c = CONFIG as unknown as Record<string, number>;
  c.OUTLET_BALLS = p.outlet;
  c.GATE_SPAWN_CLEARANCE = p.clearance;
  c.MAX_PUSH_UPS = p.pushUps;
  c.SPAWN_GROW_FRAMES = p.grow;
  return p;
}
