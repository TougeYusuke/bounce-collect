/**
 * 手触りを決める数値はすべてここに集約する。
 * 実装中に「この値どこ？」となったらこのファイルを見れば済む状態を保つこと。
 */
export const CONFIG = {
  // 盤面（論理座標。画面サイズに合わせて拡大縮小する）
  BOARD_WIDTH: 360,
  BOARD_HEIGHT: 720,

  // 玉
  BALL_RADIUS: 5,
  MAX_BALLS: 2000, // ← 実機計測で確定させる暫定値

  // 物理
  GRAVITY: 0.35,
  DAMPING: 0.995, // 空気抵抗。1.0 に近いほどよく動く
  WALL_RESTITUTION: 0.3, // 壁の跳ね返り。0 = 跳ねない
  COLLISION_ITERATIONS: 3, // 玉同士の押し戻しの反復回数

  // スリープ（積もって動かない玉を計算から外す）
  SLEEP_VELOCITY: 0.06, // このフレーム移動量を下回ったら「静止」とみなす
  SLEEP_FRAMES: 24, // 静止が何フレーム続いたら眠らせるか
} as const;
