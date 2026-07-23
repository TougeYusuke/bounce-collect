import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/core/grid';

describe('SpatialGrid', () => {
  it('近くにある点を近傍として列挙する', () => {
    const grid = new SpatialGrid(100, 100, 10);
    grid.insert(0, 15, 15);
    grid.insert(1, 18, 16); // すぐ隣
    const found: number[] = [];
    grid.forEachNeighbor(15, 15, (i) => found.push(i));
    expect(found).toContain(1);
  });

  it('離れた点は近傍に含めない', () => {
    const grid = new SpatialGrid(100, 100, 10);
    grid.insert(0, 15, 15);
    grid.insert(1, 85, 85); // 遠い
    const found: number[] = [];
    grid.forEachNeighbor(15, 15, (i) => found.push(i));
    expect(found).not.toContain(1);
  });

  it('セル境界をまたいだ隣の点も拾える', () => {
    const grid = new SpatialGrid(100, 100, 10);
    grid.insert(0, 19.5, 19.5); // セル(1,1) の端
    grid.insert(1, 20.5, 20.5); // セル(2,2) の端。距離は約1.4
    const found: number[] = [];
    grid.forEachNeighbor(19.5, 19.5, (i) => found.push(i));
    expect(found).toContain(1);
  });

  it('clear すると中身が空になる', () => {
    const grid = new SpatialGrid(100, 100, 10);
    grid.insert(0, 15, 15);
    grid.clear();
    const found: number[] = [];
    grid.forEachNeighbor(15, 15, (i) => found.push(i));
    expect(found).toHaveLength(0);
  });

  it('盤面外の座標を入れてもクラッシュしない', () => {
    const grid = new SpatialGrid(100, 100, 10);
    expect(() => grid.insert(0, -50, -50)).not.toThrow();
    expect(() => grid.insert(1, 999, 999)).not.toThrow();
    expect(() => grid.forEachNeighbor(-999, -999, () => {})).not.toThrow();
  });
});
