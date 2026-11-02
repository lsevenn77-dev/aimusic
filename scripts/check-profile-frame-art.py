"""Check normalized static/animated frame art offline (Python with Pillow)."""
import argparse
from pathlib import Path
import re

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("--effect", type=Path)
    args = parser.parse_args()
    css = (Path(__file__).resolve().parents[1] / "dist/decorations.css").read_text(encoding="utf-8")
    tokens = dict(re.findall(r"--profile-frame-(layout|base-limit|effect-limit):\s*([\d.]+)", css))
    with Image.open(args.base) as source:
        if source.width != source.height or getattr(source, "n_frames", 1) != 1:
            parser.error("expected a square static base")
        base = source.convert("RGBA")
    diameter = base.width / float(tokens["layout"])

    def check(image, limit, label):
        box = image.getchannel("A").getbbox()
        if not box:
            parser.error(f"{label}: empty artwork")
        left, top, right, bottom = box
        center = image.width / 2
        extent = max(center - left, center - top, right - center, bottom - center)
        if 2 * extent > diameter * float(tokens[limit]) + 1e-8:
            parser.error(f"{label}: alpha bounds {box} exceed centered {tokens[limit]}D")
        return extent / diameter

    peak = check(base, "base-limit", args.base.name)
    count = 1
    if args.effect:
        with Image.open(args.effect) as fx:
            if fx.size != base.size:
                parser.error("effect and base must share one canvas")
            count = getattr(fx, "n_frames", 1)
            for index in range(count):
                fx.seek(index)
                composite = Image.alpha_composite(base, fx.convert("RGBA"))
                peak = max(peak, check(composite, "effect-limit", f"{args.effect.name}[{index}]"))
    print(f"{args.base.name}: {count} frame(s), maximum axis distance {peak:.5f}D")


if __name__ == "__main__":
    main()
