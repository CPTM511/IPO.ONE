from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/cptmao/Documents/IPO.ONE/artifacts/product-design-audit/2026-07-17-decision-passport")
REFERENCE = Path("/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png")
IMPLEMENTATION = ROOT / "desktop-passport-collapsed-viewport.png"
BACKGROUND = "#f1f0f5"
INK = "#232229"
FONT = ImageFont.load_default(size=24)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGB", size, BACKGROUND)
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - copy.width) // 2
    y = (size[1] - copy.height) // 2
    result.paste(copy, (x, y))
    return result


def labelled(image: Image.Image, label: str, size: tuple[int, int]) -> Image.Image:
    header = 52
    result = Image.new("RGB", (size[0], size[1] + header), "#ffffff")
    result.paste(contain(image, size), (0, header))
    ImageDraw.Draw(result).text((20, 15), label, fill=INK, font=FONT)
    return result


reference = Image.open(REFERENCE)
implementation = Image.open(IMPLEMENTATION)

full_reference = labelled(reference, "Reference — Aave Core product hierarchy", (1280, 640))
full_implementation = labelled(implementation, "Implementation — IPO.ONE Decision Passport in Offer rail", (1280, 948))
full = Image.new("RGB", (1280, full_reference.height + full_implementation.height + 20), BACKGROUND)
full.paste(full_reference, (0, 0))
full.paste(full_implementation, (0, full_reference.height + 20))
full.save(ROOT / "comparison-full.png")

reference_focus = reference.crop((470, 610, 3630, 1884))
implementation_focus = implementation.crop((970, 0, 1375, 920))
focused_reference = labelled(reference_focus, "Reference focus — white product surface", (980, 820))
focused_implementation = labelled(implementation_focus, "Implementation focus — verified decision surface", (980, 820))
focused = Image.new("RGB", (1980, focused_reference.height), BACKGROUND)
focused.paste(focused_reference, (0, 0))
focused.paste(focused_implementation, (1000, 0))
focused.save(ROOT / "comparison-focused.png")
