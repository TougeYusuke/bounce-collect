/**
 * 一様格子による近傍探索。
 *
 * 玉同士の衝突を総当たりで調べると 2000 x 2000 = 400万回/フレームになり破綻する。
 * 盤面を格子で区切り、自分の周囲9マスにいる玉だけを調べる。
 *
 * セルサイズは玉の直径にすること（それより小さいと隣接セルを広く見る必要が出る）。
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  private cells: number[][];

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  private clampCol(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  private clampRow(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  insert(index: number, x: number, y: number): void {
    this.cells[this.clampRow(y) * this.cols + this.clampCol(x)].push(index);
  }

  /** (x, y) を含むセルとその周囲8マスにいる要素を列挙する */
  forEachNeighbor(x: number, y: number, fn: (index: number) => void): void {
    const cx = this.clampCol(x);
    const cy = this.clampRow(y);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= this.rows) continue;
      const rowOffset = gy * this.cols;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= this.cols) continue;
        const cell = this.cells[rowOffset + gx];
        for (let k = 0; k < cell.length; k++) fn(cell[k]);
      }
    }
  }
}
