import { CONFIG } from '../core/config';
import type { Stage } from '../core/stage';
import { buildStage, type StageDef } from '../core/stageDef';

/**
 * ステージ編集の「中身」。
 *
 * ⚠️ DOM も canvas も一切知らない。いまは開発用ページから使うが、
 *    あとでゲーム内モードへ載せ替える時に作り直さなくて済むようにするため
 *    （UI設計書 §4 の前提）。
 */
export type ElementKind = 'gate' | 'jumper';
export interface Selection {
  kind: ElementKind;
  index: number;
}
export type GrabMode = 'move' | 'resize-left' | 'resize-right';

/** バーの当たり判定の縦幅（掴みやすさ優先で見た目より少し広い） */
const HIT_HEIGHT = 14;
/** 端をつかんだとみなす幅 */
const EDGE = 10;
/** gateMask / jumperMask が32bit整数なので、それぞれ32個まで */
const MAX_ELEMENTS = 32;

function snap(v: number): number {
  return Math.round(v / CONFIG.EDITOR_GRID) * CONFIG.EDITOR_GRID;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class EditorModel {
  selected: Selection | null = null;
  def: StageDef;

  constructor(def: StageDef) {
    this.def = def;
  }

  private bars(kind: ElementKind): { x1: number; x2: number; y: number }[] {
    return kind === 'gate' ? this.def.gates : this.def.jumpers;
  }

  private bar(sel: Selection): { x1: number; x2: number; y: number } {
    return this.bars(sel.kind)[sel.index];
  }

  /** 論理座標の点に乗っているバーを返す。手前（後に描くもの）から順に見る */
  pick(x: number, y: number): Selection | null {
    const kinds: ElementKind[] = ['jumper', 'gate'];
    for (const kind of kinds) {
      const list = this.bars(kind);
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (x >= b.x1 && x <= b.x2 && Math.abs(y - b.y) <= HIT_HEIGHT / 2) {
          return { kind, index: i };
        }
      }
    }
    return null;
  }

  /** つかんだ場所が端なら長さ変更、真ん中なら移動 */
  grabMode(x: number, _y: number, sel: Selection): GrabMode {
    const b = this.bar(sel);
    if (x - b.x1 <= EDGE) return 'resize-left';
    if (b.x2 - x <= EDGE) return 'resize-right';
    return 'move';
  }

  select(sel: Selection | null): void {
    this.selected = sel;
  }

  /** 選択中のバーの中心を (x, y) へ。グリッド吸着と盤面内に収めるのはここでやる */
  moveTo(x: number, y: number): void {
    if (!this.selected) return;
    const b = this.bar(this.selected);
    const w = b.x2 - b.x1;
    const cx = clamp(snap(x), w / 2, CONFIG.BOARD_WIDTH - w / 2);
    b.x1 = cx - w / 2;
    b.x2 = cx + w / 2;
    b.y = clamp(snap(y), 0, CONFIG.BOARD_HEIGHT);
  }

  /** 端をドラッグして長さを変える。⚠️ 最小幅を割らない（狭いと玉が通れない） */
  resizeTo(mode: GrabMode, x: number): void {
    if (!this.selected || mode === 'move') return;
    const b = this.bar(this.selected);
    const v = clamp(snap(x), 0, CONFIG.BOARD_WIDTH);
    if (mode === 'resize-left') {
      b.x1 = Math.min(v, b.x2 - CONFIG.EDITOR_MIN_WIDTH);
    } else {
      b.x2 = Math.max(v, b.x1 + CONFIG.EDITOR_MIN_WIDTH);
    }
  }

  canAddGate(): boolean {
    return this.def.gates.length < MAX_ELEMENTS;
  }
  canAddJumper(): boolean {
    return this.def.jumpers.length < MAX_ELEMENTS;
  }

  addGate(): void {
    if (!this.canAddGate()) return;
    const w = CONFIG.BOARD_WIDTH;
    this.def.gates.push({ x1: w * 0.3, x2: w * 0.7, y: 400, multiplier: 2 });
    this.selected = { kind: 'gate', index: this.def.gates.length - 1 };
  }

  addJumper(): void {
    if (!this.canAddJumper()) return;
    const w = CONFIG.BOARD_WIDTH;
    this.def.jumpers.push({ x1: w * 0.3, x2: w * 0.7, y: 560 });
    this.selected = { kind: 'jumper', index: this.def.jumpers.length - 1 };
  }

  deleteSelected(): void {
    if (!this.selected) return;
    const { kind, index } = this.selected;
    if (kind === 'gate') this.def.gates.splice(index, 1);
    else this.def.jumpers.splice(index, 1);
    this.selected = null;
  }

  /** 倍率はゲートだけが持つ（ジャンプ台に指定しても何も起きない） */
  setMultiplier(n: number): void {
    if (!this.selected || this.selected.kind !== 'gate') return;
    this.def.gates[this.selected.index].multiplier = n;
  }

  /** いまの編集内容で実行時のステージを組む（試遊に使う） */
  buildStage(): Stage {
    return buildStage(this.def);
  }
}
