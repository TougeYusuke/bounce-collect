/**
 * 画像素材の読み込み。
 *
 * ⚠️ 読めなくてもゲームは動かす。素材が無い状態でも描画側が手描きにフォールバックするので、
 *    ここで例外を投げない（オフラインや配信ミスでゲーム全体が死ぬのを防ぐ）。
 */
const cache = new Map<string, HTMLImageElement | null>();

export function getArt(file: string): HTMLImageElement | null {
  return cache.get(file) ?? null;
}

export function loadArt(files: string[]): Promise<void> {
  return Promise.all(
    files.map(
      (f) =>
        new Promise<void>((resolve) => {
          if (cache.has(f)) return resolve();
          const im = new Image();
          im.onload = () => {
            cache.set(f, im);
            resolve();
          };
          im.onerror = () => {
            cache.set(f, null);
            resolve();
          };
          im.src = `assets/${f}`;
        }),
    ),
  ).then(() => undefined);
}
