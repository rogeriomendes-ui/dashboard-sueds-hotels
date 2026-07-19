from pathlib import Path
import argparse

from PIL import Image, ImageDraw
from reportlab.graphics.barcode import qr


def slugify(value):
    return (
        value.strip()
        .lower()
        .replace("'", "")
        .replace(" ", "-")
        .replace("_", "-")
    )


def generate_qr(payload, output_stem):
    widget = qr.QrCodeWidget(payload)
    code = widget.qr
    code.make()
    module_count = code.getModuleCount()
    quiet_zone = 4

    png_scale = 16
    png_size = (module_count + quiet_zone * 2) * png_scale
    image = Image.new("RGB", (png_size, png_size), "white")
    draw = ImageDraw.Draw(image)

    for row in range(module_count):
        for col in range(module_count):
            if not code.isDark(row, col):
                continue
            x0 = (col + quiet_zone) * png_scale
            y0 = (row + quiet_zone) * png_scale
            x1 = x0 + png_scale - 1
            y1 = y0 + png_scale - 1
            draw.rectangle((x0, y0, x1, y1), fill="black")

    output_stem.parent.mkdir(parents=True, exist_ok=True)
    png_path = output_stem.with_suffix(".png")
    image.save(png_path)

    svg_module = 8
    svg_size = (module_count + quiet_zone * 2) * svg_module
    rects = []
    for row in range(module_count):
        for col in range(module_count):
            if code.isDark(row, col):
                rects.append(
                    '<rect x="{x}" y="{y}" width="{w}" height="{w}"/>'.format(
                        x=(col + quiet_zone) * svg_module,
                        y=(row + quiet_zone) * svg_module,
                        w=svg_module,
                    )
                )

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'width="{size}" height="{size}" viewBox="0 0 {size} {size}" '
        'role="img" aria-label="QR code SUEDS Opinario">'
        '<rect width="100%" height="100%" fill="white"/>'
        '<g fill="black">{rects}</g>'
        "</svg>"
    ).format(size=svg_size, rects="".join(rects))

    svg_path = output_stem.with_suffix(".svg")
    svg_path.write_text(svg, encoding="utf-8")

    txt_path = output_stem.with_suffix(".txt")
    txt_path.write_text(payload + "\n", encoding="utf-8")

    return png_path, svg_path, txt_path


def main():
    parser = argparse.ArgumentParser(description="Generate SUEDS opinion QR codes.")
    parser.add_argument("--hotel", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--lang", default="pt-BR")
    parser.add_argument(
        "--base-url",
        default="https://dashboard-sueds-hotels.vercel.app/opinario.html",
    )
    parser.add_argument("--out-dir", default="assets/qrcodes")
    args = parser.parse_args()

    hotel_slug = slugify(args.hotel)
    payload = (
        "{base}?hotel={hotel}&form_version={version}&lang={lang}"
        .format(
            base=args.base_url,
            hotel=hotel_slug,
            version=args.version,
            lang=args.lang,
        )
    )

    output_stem = Path(args.out_dir) / "{hotel}-opinario-{version}".format(
        hotel=hotel_slug,
        version=args.version,
    )
    png_path, svg_path, txt_path = generate_qr(payload, output_stem)
    print("Payload:", payload)
    print("PNG:", png_path)
    print("SVG:", svg_path)
    print("TXT:", txt_path)


if __name__ == "__main__":
    main()
