import type { BallPool } from '../core/ball';
import type { Stage } from '../core/stage';
import type { World } from '../core/world';

/**
 * 描画方式を差し替えられるようにするための共通インターフェース。
 * core/ はこのファイルを一切知らない（依存は render → core の一方向）。
 */
export interface Renderer {
  readonly name: string;
  /** 論理座標系のサイズを渡して初期化する */
  init(container: HTMLElement, world: World): Promise<void>;
  /**
   * 1フレーム描く。stage を省くと玉と背景だけ（計測デモ用）。
   * ⚠️ メソッドを分けず1本にしてあるのは、背景→ステージ→玉 の順序を
   * 呼び出し側が間違えられないようにするため。
   */
  draw(pool: BallPool, radius: number, stage?: Stage, cupX?: number): void;
  /** 画面サイズ変更に追従する */
  resize(): void;
  /** 破棄してDOMから取り除く */
  destroy(): void;
  /** 画面のX座標を盤面の論理X座標に変換する（入力で使う） */
  toLogicalX(clientX: number): number;
}
