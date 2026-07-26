# Marble Mill

ビー玉を落とすと、下のゲートを通るたびに増えていく落ちものゲーム。

**遊ぶ → https://marble-mill.vercel.app**

- 落とす場所で結果が何十倍も変わる（適当に落とすとスコアが伸びない）
- ゲートを通るたび玉が増え、詰まった山がゲートを押し越えてさらに増える
- 最後にバケツをひっくり返して、貯まった玉を全部流す
- ブラウザだけで動く（インストール不要・スマホ対応。ホーム画面に追加すると全画面）

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm test         # テスト
npm run build    # 本番ビルド
```

ステージの作り方・合格条件・量産の道具は [`docs/stage-design.md`](docs/stage-design.md) を参照。

### 出す先

| 先 | URL | 配信の起点 |
|---|---|---|
| 本番 | https://marble-mill.vercel.app | `/`（既定） |
| GitHub Pages | https://leia-tools.github.io/marble-mill/ | `/marble-mill/`（Actions が `VITE_BASE` で渡す） |

⚠️ 配信の起点がズレると JS / CSS が 404 になる。リポジトリ名を変えたら
`.github/workflows/deploy.yml` の `VITE_BASE` も合わせること。
