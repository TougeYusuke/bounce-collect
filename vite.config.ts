import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));

/**
 * ステージエディタの保存口（開発サーバー専用）。
 *
 * ブラウザからはファイルを書けないので、開発サーバーに口を1つ足して
 * `src/stages/<name>.json` へ直接書く。**手でコピペさせないため**。
 * ⚠️ 本番ビルドには入らない（apply: 'serve'）。
 */
function stageSaver(): Plugin {
  return {
    name: 'marble-mill-stage-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-stage', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const def = JSON.parse(body);
            // ⚠️ 名前は英数字・ハイフン・アンダースコアだけ（パスを外に出させない）
            const name = String(def?.name ?? '').trim();
            if (!/^[A-Za-z0-9_-]+$/.test(name)) {
              res.statusCode = 400;
              return res.end('name は英数字・- ・_ のみです');
            }
            const outDir = join(dir, 'src', 'stages');
            mkdirSync(outDir, { recursive: true });
            const file = join(outDir, `${name}.json`);
            writeFileSync(file, `${JSON.stringify(def, null, 2)}\n`, 'utf-8');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: `src/stages/${name}.json` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// base はリポジトリ名と一致させること。
// ここがズレると GitHub Pages 上で JS / CSS が 404 になる。
export default defineConfig({
  base: '/bounce-collect/',
  plugins: [stageSaver()],
  build: {
    rollupOptions: {
      input: {
        // ゲーム本体
        main: `${dir}index.html`,
        // 性能計測デモ（玉のサイズを変えた時に測り直せるよう残しておく）
        perf: `${dir}perf.html`,
        // 挙動の検証用（1個ずつコマ送りで確かめる）
        debug: `${dir}debug.html`,
        // 物理エンジン比較（Rapier2Dが緩い斜面で流れるかを測る）
        rapier: `${dir}rapier.html`,
        // ステージエディタ（開発用。保存は開発サーバーの口を使う）
        editor: `${dir}editor.html`,
      },
    },
  },
});
