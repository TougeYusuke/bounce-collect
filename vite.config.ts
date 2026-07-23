import { defineConfig } from 'vite';

// base はリポジトリ名と一致させること。
// ここがズレると GitHub Pages 上で JS / CSS が 404 になる。
export default defineConfig({
  base: '/bounce-collect/',
});
