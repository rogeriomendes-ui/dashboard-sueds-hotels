from pathlib import Path

import qrcode
import qrcode.image.svg


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "qrcodes"
BASE_URL = "https://dashboard-sueds-hotels.vercel.app/opinario.html"
FORM_VERSION = "20260729"

HOTELS = {
    "sueds-cabralia": "sueds-cabralia",
    "sueds-segundo-sol": "sueds-segundo-sol",
    "sueds-plaza": "sueds-plaza",
    "sueds-premium": "sueds-premium",
    "sueds-trancoso": "sueds-trancoso",
    "casas-sueds-arraial": "casas-sueds-arraial",
}


def opinion_url(slug):
    return (
        f"{BASE_URL}?hotel={slug}"
        f"&form_version={FORM_VERSION}"
        "&lang=pt-BR"
    )


def create_png(url, destination):
    code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=24,
        border=4,
    )
    code.add_data(url)
    code.make(fit=True)
    code.make_image(fill_color="black", back_color="white").save(destination)


def create_svg(url, destination):
    code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        border=4,
        image_factory=qrcode.image.svg.SvgPathImage,
    )
    code.add_data(url)
    code.make(fit=True)
    code.make_image().save(destination)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, slug in HOTELS.items():
        url = opinion_url(slug)
        base = OUTPUT_DIR / f"{filename}-opinario-{FORM_VERSION}"
        create_png(url, base.with_suffix(".png"))
        create_svg(url, base.with_suffix(".svg"))
        base.with_suffix(".txt").write_text(url + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
