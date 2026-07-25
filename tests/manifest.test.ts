import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ホーム画面に追加した時の設定（PWA・2026-07-26）。
 *
 * 🔑 見張る理由＝**参照切れが画面に出ない**。アイコンのパスを間違えても、
 *    普通に開いている限り何も起きず、ホーム追加した時だけ絵が出ない。
 */
const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

function manifest(): {
  display: string;
  orientation: string;
  start_url: string;
  icons: { src: string; sizes: string; purpose: string }[];
} {
  return JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
}

describe('ホーム画面に追加した時の設定', () => {
  it('全画面（standalone）で開く＝ブラウザの上下バーが消える', () => {
    expect(manifest().display).toBe('standalone');
  });

  it('縦向きで固定する（盤面が縦長なので横だと遊べない）', () => {
    expect(manifest().orientation).toBe('portrait');
  });

  it('⚠️ 指しているアイコンが実在する', () => {
    for (const icon of manifest().icons) {
      expect(existsSync(join(PUBLIC, icon.src)), icon.src).toBe(true);
    }
  });

  it('⚠️ 切り抜かれても欠けない用（maskable）を持っている', () => {
    expect(manifest().icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('⚠️ manifest の中のパスは相対にする（manifest自身の位置から解決されるため）', () => {
    const m = manifest();
    expect(m.start_url.startsWith('/')).toBe(false);
    for (const icon of m.icons) expect(icon.src.startsWith('/')).toBe(false);
  });

  it('iOSのホーム画面用アイコンが実在する（manifestを見ないため別に要る）', () => {
    const m = appleIcon();
    expect(m).not.toBeNull();
    expect(existsSync(join(PUBLIC, m!))).toBe(true);
  });

  it('⚠️ index.html の中のパスは `/` から書く（Viteが base を足すのはそれだけ）', () => {
    // 🔑 2026-07-26: `assets/…` の相対で書いていたら、iOSがホーム画面のアイコンを拾えず
    //    頭文字の「M」になった。画像は正常で、`/`始まりの favicon だけ効いていた。
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    for (const re of [/rel="manifest"[^>]*href="([^"]+)"/, /rel="apple-touch-icon"[^>]*href="([^"]+)"/]) {
      const m = html.match(re);
      expect(m, String(re)).not.toBeNull();
      expect(m![1].startsWith('/'), m![1]).toBe(true);
    }
  });
});

/** index.html が指している apple-touch-icon のパス（public からの相対に直して返す） */
function appleIcon(): string | null {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
  return m ? m[1].replace(/^\//, '') : null;
}
