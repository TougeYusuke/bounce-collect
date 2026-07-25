"""ホーム画面に追加した時のアイコンを作る（PWA・2026-07-26）。

🔑 **実物の玉と同じ描き方**（`src/render/ballArt.ts` の琥珀のビー玉）にする。
   別の絵にすると、アイコンとゲームの見た目が食い違う。

⚠️ **maskable 用は玉を小さく描く**。Androidはアイコンを丸や角丸に切り抜くので、
   端まで描くと縁が欠ける（安全領域＝中央80%）。

使い方: python mockup/make_icons.py
"""

import math
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"

BG = (0x17, 0x0E, 0x09)
# 琥珀のビー玉（theme.ts の amber と同じ）
HI = (0xFF, 0xF6, 0xDE)
MID = (0xF4, 0xC9, 0x6C)
LO = (0xA0, 0x6F, 0x1C)

SS = 4  # 4倍で描いてから縮める（縁のギザギザ消し）


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def color_at(t: float) -> tuple[int, int, int]:
    """0=ハイライト 0.62=中間 1=縁。実物の createRadialGradient と同じ止め位置"""
    if t < 0.62:
        k = t / 0.62
        return (lerp(HI[0], MID[0], k), lerp(HI[1], MID[1], k), lerp(HI[2], MID[2], k))
    k = (t - 0.62) / 0.38
    return (lerp(MID[0], LO[0], k), lerp(MID[1], LO[1], k), lerp(MID[2], LO[2], k))


def make(size: int, ball_ratio: float, out: str) -> None:
    n = size * SS
    img = Image.new("RGB", (n, n), BG)
    px = img.load()
    cx = cy = n / 2
    r = n * ball_ratio / 2
    # ハイライトは左上へずらす（実物と同じ）
    hx, hy = cx - r * 0.35, cy - r * 0.35
    # 落ち影（右下・実物は影を焼き込んでいる）
    sx, sy = cx + r * 0.16, cy + r * 0.2

    for y in range(n):
        for x in range(n):
            d = math.hypot(x - cx, y - cy)
            if d <= r:
                t = min(1.0, math.hypot(x - hx, y - hy) / (r * 1.35))
                px[x, y] = color_at(t)
            elif math.hypot(x - sx, y - sy) <= r:
                # 影は背景を暗くするだけ
                px[x, y] = (BG[0] // 2, BG[1] // 2, BG[2] // 2)

    img.resize((size, size), Image.LANCZOS).save(ASSETS / out, "PNG", optimize=True)
    print(f"{out} {size}x{size} 玉={ball_ratio:.0%}")


def main() -> None:
    make(192, 0.72, "icon-192.png")
    make(512, 0.72, "icon-512.png")
    # ⚠️ 切り抜かれても欠けないよう小さめに
    make(512, 0.56, "icon-maskable-512.png")
    # iOSのホーム画面用（iOS側で角丸にされる）
    make(180, 0.72, "apple-touch-icon.png")


if __name__ == "__main__":
    main()
