import type { BallPool } from '../core/ball';
import type { World } from '../core/world';

/**
 * 描画方式を差し替えられるようにするための共通インターフェース。
 * core/ はこのファイルを一切知らない（依存は render → core の一方向）。
 */
export interface Renderer {
  readonly name: string;
  /** 論理座標系のサイズを渡して初期化する */
  init(container: HTMLElement, world: World): Promise<void>;
  /** 1フレーム描画する */
  draw(pool: BallPool, radius: number): void;
  /** 画面サイズ変更に追従する */
  resize(): void;
  /** 破棄してDOMから取り除く */
  destroy(): void;
}
