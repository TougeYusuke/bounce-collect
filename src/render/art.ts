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

/**
 * `onProgress` は1枚読めるたびに (読めた枚数, 全体) で呼ばれる。
 * ⚠️ 読み込みには**数秒かかる**（モバイル回線）。呼ぶ側は進み具合を画面に出すこと。
 *    出さないと真っ黒な画面のまま固まって見える（2026-07-25 れいあのiPhoneで判明）。
 */
export function loadArt(files: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  const total = files.length;
  onProgress?.(0, total);
  return Promise.all(
    files.map(
      (f) =>
        new Promise<void>((resolve) => {
          const finish = (): void => {
            done++;
            onProgress?.(done, total);
            resolve();
          };
          if (cache.has(f)) return finish();
          const im = new Image();
          im.onload = () => {
            cache.set(f, im);
            finish();
          };
          im.onerror = () => {
            cache.set(f, null);
            finish();
          };
          im.src = `assets/${f}`;
        }),
    ),
  ).then(() => undefined);
}
