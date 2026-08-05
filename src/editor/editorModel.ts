import { CONFIG } from '../core/config';
import { createRng } from '../core/rng';
import type { Stage } from '../core/stage';
import { rollStage } from '../core/stageRoll';
import { MAX_GATES, buildStage, type StageDef } from '../core/stageDef';

/**
 * ステージ編集の「中身」。
 *
 * ⚠️ DOM も canvas も一切知らない。いまは開発用ページから使うが、
 *    あとでゲーム内モードへ載せ替える時に作り直さなくて済むようにするため
 *    （UI設計書 §4 の前提）。
 */
export type ElementKind = 'gate' | 'jumper' | 'divider';
export interface Selection {
  kind: ElementKind;
  index: number;
}
/**
 * つかみ方。
 * ⚠️ left/right ではなく start/end。仕切りは斜めにも縦にもなるので、
 *    「左右」では意味が合わなくなる（start = (x1,y1) 側 / end = (x2,y2) 側）。
 */
export type GrabMode = 'move' | 'resize-start' | 'resize-end';

/**
 * 端をつかんだとみなす幅。**マウス用**。
 * ⚠️ 指はこれでは掴めないので、`editorMain` が選択中の部品に32pxのハンドルを出して受ける。
 *    ここを広げて兼用にしないこと＝最小幅32pxのバーが端2つで埋まって移動できなくなる。
 */
const EDGE = 10;
/**
 * ⚠️ ゲートの上限は **core が正本**（`MAX_GATES`）。エディタと生成ツールで同じ値を見る。
 *    読み込みは止めない＝9本を超えて保存された型もそのまま開けて編集・保存できる
 *    （縛るのは「これ以上足せない」だけ）。
 */
/** 仕切りはマスクを持たないので上限は要らないが、際限なく増えても扱えないので抑える */
const MAX_DIVIDERS = 16;

type Bar = { x1: number; x2: number; y: number };
type Divider = { x1: number; y1: number; x2: number; y2: number };

/**
 * 端を伸ばすハンドルの当たり半径（論理px）。`scale` は 論理px → 画面px の拡大率。
 *
 * 🔑 指の大きさは**画面px**で決まるので拡大率で割る（画面が小さいほど論理座標では大きい）。
 * ⚠️ **部品の長さの1/3を超えさせないこと**。最小幅32pxのバーの両端に指サイズの丸を置くと
 *    全面が伸縮になり「真ん中を掴んで移動」が消える。
 * ⚠️ **描画側も必ずこの値を使う**（見た目の丸と当たり判定をズラさない）。
 */
export function handleRadius(length: number, scale: number): number {
  return Math.min(CONFIG.EDITOR_HANDLE_CSS / 2 / scale, Math.abs(length) / 3);
}

function snap(v: number): number {
  return Math.round(v / CONFIG.EDITOR_GRID) * CONFIG.EDITOR_GRID;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 点 (px,py) と線分 d の距離 */
function distanceToDivider(px: number, py: number, d: Divider): number {
  const dx = d.x2 - d.x1;
  const dy = d.y2 - d.y1;
  const len2 = dx * dx + dy * dy;
  // 長さ0の線分は端点との距離で見る（壊れたデータ避け）
  const t = len2 === 0 ? 0 : clamp(((px - d.x1) * dx + (py - d.y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (d.x1 + dx * t), py - (d.y1 + dy * t));
}

export class EditorModel {
  selected: Selection | null = null;
  def: StageDef;

  constructor(def: StageDef) {
    this.def = def;
  }

  private bars(kind: ElementKind): Bar[] {
    return kind === 'gate' ? this.def.gates : this.def.jumpers;
  }

  private bar(sel: Selection): Bar {
    return this.bars(sel.kind)[sel.index];
  }

  private divider(sel: Selection): Divider {
    return this.def.dividers[sel.index];
  }

  /**
   * 論理座標の点に乗っているものを返す。手前（後に描くもの）から順に見る。
   * ⚠️ 仕切りは最後。細い線を先に見るとゲートと交差した所でゲートが掴めなくなる。
   * ⚠️ **拾う順（ジャンプ台 → ゲート → 仕切り）を崩さないこと**。既定の型は最下段が
   *    「ジャンプ台｜ゲート」の横並びなので、順を入れ替えると同じ段で取り違える。
   * ⚠️ 広げるのは**縦だけ**（`CONFIG.EDITOR_HIT`）。横はバーの範囲そのまま＝同じ段の
   *    ゲートの隙間が18pxしかなく、広げると隣が返る。
   */
  pick(x: number, y: number): Selection | null {
    const kinds: ElementKind[] = ['jumper', 'gate'];
    for (const kind of kinds) {
      const list = this.bars(kind);
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (x >= b.x1 && x <= b.x2 && Math.abs(y - b.y) <= CONFIG.EDITOR_HIT) {
          return { kind, index: i };
        }
      }
    }
    for (let i = this.def.dividers.length - 1; i >= 0; i--) {
      if (distanceToDivider(x, y, this.def.dividers[i]) <= CONFIG.EDITOR_HIT) {
        return { kind: 'divider', index: i };
      }
    }
    return null;
  }

  /** つかんだ場所が端なら長さ変更、真ん中なら移動 */
  grabMode(x: number, y: number, sel: Selection): GrabMode {
    if (sel.kind === 'divider') {
      const d = this.divider(sel);
      if (Math.hypot(x - d.x1, y - d.y1) <= EDGE) return 'resize-start';
      if (Math.hypot(x - d.x2, y - d.y2) <= EDGE) return 'resize-end';
      return 'move';
    }
    const b = this.bar(sel);
    if (x - b.x1 <= EDGE) return 'resize-start';
    if (b.x2 - x <= EDGE) return 'resize-end';
    return 'move';
  }

  select(sel: Selection | null): void {
    this.selected = sel;
  }

  /** 選択中のものの中心を (x, y) へ。グリッド吸着と盤面内に収めるのはここでやる */
  moveTo(x: number, y: number): void {
    if (!this.selected) return;
    if (this.selected.kind === 'divider') {
      const d = this.divider(this.selected);
      const halfW = Math.abs(d.x2 - d.x1) / 2;
      const halfH = Math.abs(d.y2 - d.y1) / 2;
      const cx = clamp(snap(x), halfW, CONFIG.BOARD_WIDTH - halfW);
      const cy = clamp(snap(y), halfH, CONFIG.BOARD_HEIGHT - halfH);
      // 形（長さ・傾き）を保ったまま平行移動する
      const dx = cx - (d.x1 + d.x2) / 2;
      const dy = cy - (d.y1 + d.y2) / 2;
      d.x1 += dx;
      d.x2 += dx;
      d.y1 += dy;
      d.y2 += dy;
      return;
    }
    const b = this.bar(this.selected);
    const w = b.x2 - b.x1;
    const cx = clamp(snap(x), w / 2, CONFIG.BOARD_WIDTH - w / 2);
    b.x1 = cx - w / 2;
    b.x2 = cx + w / 2;
    // ⚠️ ジャンプ台は最下段の帯から出せない（「最下段に1台」の制約の片割れ）
    const top = this.selected.kind === 'jumper' ? CONFIG.JUMPER_ZONE_TOP : 0;
    b.y = clamp(snap(y), top, CONFIG.BOARD_HEIGHT);
  }

  /**
   * 選択中のものを相対移動する（十字キー用）。
   * ⚠️ 制約（盤面内・ジャンプ台の帯）は `moveTo` と同じものが効く。
   */
  moveBy(dx: number, dy: number): void {
    const sel = this.selected;
    if (!sel) return;
    if (sel.kind === 'divider') {
      const d = this.divider(sel);
      this.moveTo((d.x1 + d.x2) / 2 + dx, (d.y1 + d.y2) / 2 + dy);
      return;
    }
    const b = this.bar(sel);
    this.moveTo((b.x1 + b.x2) / 2 + dx, b.y + dy);
  }

  /**
   * 端をドラッグして長さを変える。
   * ⚠️ 最小の長さを割らない（狭いと玉が通れない／短い仕切りは何も仕切らない）。
   * 仕切りは端点が縦にも動くので y も受け取る（バーは y を使わない）。
   */
  resizeTo(mode: GrabMode, x: number, y = 0): void {
    if (!this.selected || mode === 'move') return;

    if (this.selected.kind === 'divider') {
      const d = this.divider(this.selected);
      const fixedX = mode === 'resize-start' ? d.x2 : d.x1;
      const fixedY = mode === 'resize-start' ? d.y2 : d.y1;
      let px = clamp(snap(x), 0, CONFIG.BOARD_WIDTH);
      let py = clamp(snap(y), 0, CONFIG.BOARD_HEIGHT);

      // 短くなりすぎたら、向きを保ったまま最小の長さまで押し戻す
      let dx = px - fixedX;
      let dy = py - fixedY;
      const len = Math.hypot(dx, dy);
      const min = CONFIG.EDITOR_MIN_WIDTH;
      if (len < min) {
        if (len === 0) {
          dx = 0;
          dy = min; // 潰れた時は下向きに伸ばす
        } else {
          const s = min / len;
          dx *= s;
          dy *= s;
        }
        px = fixedX + dx;
        py = fixedY + dy;
      }

      if (mode === 'resize-start') {
        d.x1 = px;
        d.y1 = py;
      } else {
        d.x2 = px;
        d.y2 = py;
      }
      return;
    }

    const b = this.bar(this.selected);
    const v = clamp(snap(x), 0, CONFIG.BOARD_WIDTH);
    if (mode === 'resize-start') {
      b.x1 = Math.min(v, b.x2 - CONFIG.EDITOR_MIN_WIDTH);
    } else {
      b.x2 = Math.max(v, b.x1 + CONFIG.EDITOR_MIN_WIDTH);
    }
  }

  /** ⚠️ ゲートは `MAX_GATES` 本まで。超えて保存された型を開いた時は false のまま＝減らすまで足せない */
  canAddGate(): boolean {
    return this.def.gates.length < MAX_GATES;
  }
  /** ⚠️ ジャンプ台は最下段に**1台まで**（2026-07-24 れいあ裁定）。複数だとラウンドが終わらない */
  canAddJumper(): boolean {
    return this.def.jumpers.length < 1;
  }
  canAddDivider(): boolean {
    return this.def.dividers.length < MAX_DIVIDERS;
  }

  addGate(): void {
    if (!this.canAddGate()) return;
    const w = CONFIG.BOARD_WIDTH;
    this.def.gates.push({ x1: w * 0.3, x2: w * 0.7, y: 400, multiplier: 2 });
    this.selected = { kind: 'gate', index: this.def.gates.length - 1 };
  }

  /** ⚠️ 幅は左右にまたがらせる。中央だけだと仕切りで玉が散って一度も乗らない（実測） */
  addJumper(): void {
    if (!this.canAddJumper()) return;
    const w = CONFIG.BOARD_WIDTH;
    this.def.jumpers.push({ x1: w * 0.06, x2: w * 0.94, y: 520 });
    this.selected = { kind: 'jumper', index: this.def.jumpers.length - 1 };
  }

  /** ⚠️ 既定の仕切り（y=250〜320）と重ならない位置に出す。重なると足したのが見えない */
  addDivider(): void {
    if (!this.canAddDivider()) return;
    const w = CONFIG.BOARD_WIDTH;
    this.def.dividers.push({ x1: w * 0.5, y1: 380, x2: w * 0.5, y2: 460 });
    this.selected = { kind: 'divider', index: this.def.dividers.length - 1 };
  }

  deleteSelected(): void {
    if (!this.selected) return;
    const { kind, index } = this.selected;
    if (kind === 'gate') this.def.gates.splice(index, 1);
    else if (kind === 'jumper') this.def.jumpers.splice(index, 1);
    else this.def.dividers.splice(index, 1);
    this.selected = null;
  }

  /** 倍率はゲートだけが持つ（ほかに指定しても何も起きない） */
  setMultiplier(n: number): void {
    if (!this.selected || this.selected.kind !== 'gate') return;
    this.def.gates[this.selected.index].multiplier = n;
  }

  /**
   * 跳ね返せる玉の個数。**ジャンプ台だけ**が持つ。
   * ⚠️ ここがラウンドの長さの主レバー（数えるのは個数であって重さではない）。
   */
  setCapacity(n: number): void {
    if (!this.selected || this.selected.kind !== 'jumper') return;
    if (!Number.isFinite(n)) return;
    this.def.jumpers[this.selected.index].capacity = Math.max(1, Math.round(n));
  }

  /** 実際に効いている跳ね上限（未指定なら CONFIG の既定値）。ジャンプ台以外は null */
  capacityOf(sel: Selection | null = this.selected): number | null {
    if (!sel || sel.kind !== 'jumper') return null;
    return this.def.jumpers[sel.index]?.capacity ?? CONFIG.JUMPER_CAPACITY;
  }

  /**
   * 「固定する」の切り替え（2026-07-27 れいあ要望）。
   * ⚠️ 意味が種類で違う＝**ゲートは倍率／ジャンプ台は位置**を固定する。
   *    仕切りは抽選の対象ではないので何も起きない。
   */
  setFixed(on: boolean): void {
    const sel = this.selected;
    if (!sel) return;
    if (sel.kind === 'gate') this.def.gates[sel.index].fixed = on;
    else if (sel.kind === 'jumper') this.def.jumpers[sel.index].fixed = on;
  }

  /** 「固定する」の状態。抽選の対象でないもの（仕切り）は null */
  fixedOf(sel: Selection | null = this.selected): boolean | null {
    if (!sel) return null;
    if (sel.kind === 'gate') return this.def.gates[sel.index]?.fixed === true;
    if (sel.kind === 'jumper') return this.def.jumpers[sel.index]?.fixed === true;
    return null;
  }

  /**
   * 数値を直に打ち込んだ後、制約に収め直す
   * （盤面の中・最小幅・ジャンプ台は最下段の帯）。ドラッグ側は各メソッドが自分で守る。
   */
  normalizeSelected(): void {
    const sel = this.selected;
    if (!sel) return;
    if (sel.kind === 'divider') {
      const d = this.divider(sel);
      d.x1 = clamp(d.x1, 0, CONFIG.BOARD_WIDTH);
      d.x2 = clamp(d.x2, 0, CONFIG.BOARD_WIDTH);
      d.y1 = clamp(d.y1, 0, CONFIG.BOARD_HEIGHT);
      d.y2 = clamp(d.y2, 0, CONFIG.BOARD_HEIGHT);
      return;
    }
    const b = this.bar(sel);
    b.x1 = clamp(b.x1, 0, CONFIG.BOARD_WIDTH - CONFIG.EDITOR_MIN_WIDTH);
    b.x2 = clamp(b.x2, b.x1 + CONFIG.EDITOR_MIN_WIDTH, CONFIG.BOARD_WIDTH);
    const top = sel.kind === 'jumper' ? CONFIG.JUMPER_ZONE_TOP : 0;
    b.y = clamp(b.y, top, CONFIG.BOARD_HEIGHT);
  }

  /**
   * 中身（ゲートの倍率・ジャンプ台の跳ね上限）を抽選し直す。**位置は変わらない**。
   * ⚠️ 本番はゲームを始めるたびに勝手に振られる。ここは「どんな出方をするか見る」ためのボタン。
   */
  roll(seed: number): void {
    this.def = rollStage(this.def, createRng(seed));
    this.selected = null;
  }

  /** 保存しておいたステージを開く（選択は外す＝古い index を持ち越さないため） */
  load(def: StageDef): void {
    this.def = def;
    this.selected = null;
  }

  /** いまの編集内容で実行時のステージを組む（試遊に使う） */
  buildStage(): Stage {
    return buildStage(this.def);
  }
}
