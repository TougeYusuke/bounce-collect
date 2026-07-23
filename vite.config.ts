import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));

// base はリポジトリ名と一致させること。
// ここがズレると GitHub Pages 上で JS / CSS が 404 になる。
export default defineConfig({
  base: '/bounce-collect/',
  build: {
    rollupOptions: {
      input: {
        // ゲーム本体
        main: `${dir}index.html`,
        // 性能計測デモ（玉のサイズを変えた時に測り直せるよう残しておく）
        perf: `${dir}perf.html`,
        // 挙動の検証用（1個ずつコマ送りで確かめる）
        debug: `${dir}debug.html`,
      },
    },
  },
});
