"""盤面・タイトル背景を軽くする（スマホの読み込み対策・2026-07-25）。

⚠️ **盤面画像は透過を使わない**（全面に敷く背景）ので JPEG で十分。
   PNG のままだと1枚2〜3MB × 6枚＝約15MBあり、モバイル回線では読み込みに10秒以上かかって
   「真っ暗な画面にHUDだけ」が出ていた（れいあのiPhoneのスクショで判明）。

⚠️ **解像度は変えない**（1024×1536のまま）。見た目を変えずに容量だけ落とすため。
   ⚠️ 器は透過が要るので PNG のまま。木のバケツだけ他と揃えて320pxへ縮める。

使い方: python mockup/shrink_assets.py
"""

from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"

# 背景として全面に敷くもの＝透過不要 → JPEG
TO_JPEG = [
    "board-wood.png",
    "board-cherry.png",
    "board-bamboo.png",
    "board-walnut.png",
    "board-maple.png",
    "board-driftwood.png",
    "title-bg.png",
]

# 透過が要るので PNG のまま。高さだけ他の器に揃える
SHRINK_PNG = {"bucket-wood.png": 320}

QUALITY = 85


def main() -> None:
    total_before = 0
    total_after = 0
    for name in TO_JPEG:
        src = ASSETS / name
        if not src.exists():
            print(f"skip (ない): {name}")
            continue
        dst = src.with_suffix(".jpg")
        before = src.stat().st_size
        with Image.open(src) as im:
            im.convert("RGB").save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        after = dst.stat().st_size
        total_before += before
        total_after += after
        print(f"{name} {before/1024/1024:.2f}MB -> {dst.name} {after/1024:.0f}KB")

    for name, height in SHRINK_PNG.items():
        src = ASSETS / name
        if not src.exists():
            print(f"skip (ない): {name}")
            continue
        before = src.stat().st_size
        with Image.open(src) as im:
            w = round(im.width * height / im.height)
            out = im.convert("RGBA").resize((w, height), Image.LANCZOS)
            out.save(src, "PNG", optimize=True)
        after = src.stat().st_size
        total_before += before
        total_after += after
        print(f"{name} {before/1024/1024:.2f}MB -> {after/1024:.0f}KB ({w}x{height})")

    print(f"\n合計 {total_before/1024/1024:.2f}MB -> {total_after/1024/1024:.2f}MB")


if __name__ == "__main__":
    main()
