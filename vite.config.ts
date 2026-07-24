import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const stageDir = join(dir, 'src', 'stages');

/** ⚠️ 名前は英数字・ハイフン・アンダースコアだけ（パスを外に出させない） */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

function sendJson(res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }, body: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * ステージエディタの保存・読み込み口（開発サーバー専用）。
 *
 * ブラウザからはファイルを読み書きできないので、開発サーバーに口を足して
 * `src/stages/<name>.json` を直接扱う。**手でコピペさせないため**。
 * ⚠️ 本番ビルドには入らない（apply: 'serve'）。
 *
 * - `POST /__save-stage` … 保存（body = StageDef）
 * - `GET  /__stages`      … 保存済みの名前一覧
 * - `GET  /__stages?name=x` … その中身
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
            const name = String(def?.name ?? '').trim();
            if (!SAFE_NAME.test(name)) {
              res.statusCode = 400;
              return res.end('name は英数字・- ・_ のみです');
            }
            mkdirSync(stageDir, { recursive: true });
            const file = join(stageDir, `${name}.json`);
            writeFileSync(file, `${JSON.stringify(def, null, 2)}\n`, 'utf-8');
            sendJson(res, { ok: true, file: `src/stages/${name}.json` });
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });

      server.middlewares.use('/__stages', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          return res.end('GET only');
        }
        const name = new URL(req.url ?? '/', 'http://localhost').searchParams.get('name');

        // 名前の指定なし = 一覧（保存前は空。ディレクトリが無くても落とさない）
        if (!name) {
          const names = existsSync(stageDir)
            ? readdirSync(stageDir)
                .filter((f) => f.endsWith('.json'))
                .map((f) => f.slice(0, -'.json'.length))
                .sort()
            : [];
          return sendJson(res, { stages: names });
        }

        if (!SAFE_NAME.test(name)) {
          res.statusCode = 400;
          return res.end('name は英数字・- ・_ のみです');
        }
        const file = join(stageDir, `${name}.json`);
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end('そのステージは無いよ');
        }
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(file, 'utf-8'));
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
