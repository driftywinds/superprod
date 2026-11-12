"""Compose the Android mockup sheet from rendered screenshots.

Usage: python tools/make-mockup.py
Reads docs/screenshots/android-*.png, writes docs/screenshots/mockup-android.png.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"

SCREEN_W = 412
BEZEL = 9
FRAME_W = SCREEN_W + BEZEL * 2
GAP = 46
MARGIN = 54
TITLE_H = 132
LABEL_H = 68

BG = (7, 8, 9)
FRAME = (26, 31, 37)
FRAME_EDGE = (43, 51, 60)
TEXT = (232, 238, 244)
DIM = (138, 150, 162)
ACCENT = (79, 156, 249)

PANELS = [
    ("android-today.png", "Today", "schedule, estimate, priority, live tracking"),
    ("android-detail.png", "Task detail", "notes, tags, subtasks, due date, estimate"),
    ("android-settings.png", "Settings", "every upstream section, mapped and tracked"),
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255
    )
    return mask


def frame_screen(path: Path) -> Image.Image:
    raw = Image.open(path).convert("RGB")
    height = round(raw.height * SCREEN_W / raw.width)
    screen = raw.resize((SCREEN_W, height), Image.LANCZOS)

    frame = Image.new("RGB", (FRAME_W, height + BEZEL * 2), FRAME)
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle(
        (0, 0, FRAME_W - 1, height + BEZEL * 2 - 1),
        radius=34,
        fill=FRAME,
        outline=FRAME_EDGE,
        width=2,
    )
    # Punch the screen in with rounded corners so it sits inside the bezel.
    frame.paste(screen, (BEZEL, BEZEL), rounded_mask((SCREEN_W, height), 26))
    return frame


def main() -> None:
    frames = [frame_screen(SHOTS / name) for name, _, _ in PANELS]
    frame_h = max(f.height for f in frames)

    width = MARGIN * 2 + len(frames) * FRAME_W + (len(frames) - 1) * GAP
    height = TITLE_H + LABEL_H + frame_h + MARGIN

    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)

    title_font = load_font(34, bold=True)
    sub_font = load_font(17)
    label_font = load_font(19, bold=True)
    caption_font = load_font(15)

    draw.text((MARGIN, 42), "superprod", font=title_font, fill=TEXT)
    draw.text(
        (MARGIN, 86),
        "Android — self-hosted sync, feature parity in progress",
        font=sub_font,
        fill=DIM,
    )
    draw.rectangle((MARGIN, TITLE_H - 18, MARGIN + 52, TITLE_H - 15), fill=ACCENT)

    for index, (frame, (_, label, caption)) in enumerate(zip(frames, PANELS)):
        x = MARGIN + index * (FRAME_W + GAP)
        y = TITLE_H + LABEL_H

        draw.text((x + 2, TITLE_H + 2), label, font=label_font, fill=TEXT)
        draw.text((x + 2, TITLE_H + 30), caption, font=caption_font, fill=DIM)

        # Soft edge: two faint concentric outlines read as a shadow on near-black.
        for offset, tone in ((10, (12, 14, 17)), (5, (17, 20, 24))):
            draw.rounded_rectangle(
                (
                    x - offset,
                    y - offset,
                    x + FRAME_W + offset,
                    y + frame.height + offset,
                ),
                radius=34 + offset,
                outline=tone,
                width=3,
            )
        canvas.paste(frame, (x, y))

    out = SHOTS / "mockup-android.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({width}x{height})")


if __name__ == "__main__":
    main()
