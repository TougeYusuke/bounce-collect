import { defineConfig } from 'vitest/config';

/**
 * ステージ量産の道具だけを走らせる設定。
 *
 * ⚠️ 普段のテスト（`npm test` / CIのデプロイ）とは分けてある。
 *    ここの中身は実際にゲームを何十回も通しで回すので1回に数分かかり、
 *    毎回のテストに混ぜるとデプロイが詰まる。
 */
export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
    // 通しで何十回も回すので、既定のタイムアウトでは足りない
    testTimeout: 1_800_000,
  },
});
