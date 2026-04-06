from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup


DEFAULT_URL = "https://www.presidency.eg/ar/%D9%85%D8%B5%D8%B1/%D8%A7%D9%84%D8%B9%D8%B7%D9%84%D8%A7%D8%AA-%D8%A7%D9%84%D8%B1%D8%B3%D9%85%D9%8A%D8%A9/"
DEFAULT_OUTPUT = Path(__file__).with_name("holidays.json")
CAIRO_OFFSET = timezone(timedelta(hours=2))

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
MONTHS = {
    "يناير": 1,
    "فبراير": 2,
    "مارس": 3,
    "ابريل": 4,
    "مايو": 5,
    "يونيو": 6,
    "يوليو": 7,
    "اغسطس": 8,
    "سبتمبر": 9,
    "اكتوبر": 10,
    "نوفمبر": 11,
    "ديسمبر": 12,
}

WEEKDAYS = {
    "الاحد",
    "الأحد",
    "الاثنين",
    "الإثنين",
    "الثلاثاء",
    "الاربعاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
}

STOP_MARKERS = (
    "قم بالمشاركة على",
    "الحقوق جميعها محفوظة",
    "تم نسخ الرابط",
)


def normalize_digits(value: str) -> str:
    return value.translate(ARABIC_DIGITS)


def normalize_text(value: str) -> str:
    cleaned = value.replace("\xa0", " ")
    cleaned = cleaned.replace("–", "-").replace("—", "-").replace("−", "-")
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_month_name(value: str) -> str:
    normalized = normalize_text(value).strip("()[]{}.,،:؛")
    return normalized.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")


def is_date_line(value: str) -> bool:
    normalized = normalize_month_name(normalize_digits(normalize_text(value)))
    return any(month in normalized for month in MONTHS) and bool(
        re.search(r"\d", normalized)
    )


def extract_year(soup: BeautifulSoup) -> int:
    candidates: list[str] = []

    if soup.title and soup.title.string:
        candidates.append(soup.title.string)

    for tag in soup.find_all(["h1", "h2"]):
        text = tag.get_text(" ", strip=True)
        if text:
            candidates.append(text)

    for candidate in candidates:
        normalized = normalize_digits(normalize_text(candidate))
        match = re.search(r"لعام\s+(\d{4})", normalized)
        if match:
            return int(match.group(1))

    raise ValueError("Could not determine the holiday year from the page.")


def fetch_html(url: str) -> str:
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    response = scraper.get(url, timeout=30)
    response.raise_for_status()

    if (
        "browser-verification" in response.text
        or "cf-browser-verification" in response.text
    ):
        raise RuntimeError(
            "The website returned a browser verification page instead of the holiday page."
        )

    return response.text


def extract_holiday_pairs_from_blocks(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []

    for block in soup.select("div.holiday-content"):
        lines = [
            normalize_text(p.get_text(" ", strip=True)) for p in block.find_all("p")
        ]
        lines = [line for line in lines if line]

        if len(lines) < 2 or not is_date_line(lines[0]):
            continue

        pairs.append((lines[0], lines[1]))

    return pairs


def extract_holiday_pairs_from_text(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    started = False
    pending_date: str | None = None

    for raw_text in soup.stripped_strings:
        text = normalize_text(raw_text)
        if not text:
            continue

        if not started:
            if "العطلات الرسمية لعام" in text:
                started = True
            continue

        if any(marker in text for marker in STOP_MARKERS):
            break

        if text in {
            "الصفحة الرئيسية",
            "مصر",
            "العـطلات الرسمية",
            "العطلات الرسمية",
            "/",
        }:
            continue

        if is_date_line(text):
            pending_date = text
            continue

        if pending_date:
            pairs.append((pending_date, text))
            pending_date = None

    return pairs


def extract_holiday_pairs(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs = extract_holiday_pairs_from_blocks(soup)
    if pairs:
        return pairs
    return extract_holiday_pairs_from_text(soup)


def parse_date_part(value: str, fallback_month: int | None = None) -> tuple[int, int]:
    normalized = normalize_digits(normalize_text(value))
    tokens = [token.strip("()[]{}.,،:؛") for token in normalized.split()]

    day: int | None = None
    month: int | None = None

    for token in tokens:
        if not token or token in WEEKDAYS:
            continue

        if day is None and token.isdigit():
            day = int(token)
            continue

        normalized_month = normalize_month_name(token)
        if normalized_month in MONTHS:
            month = MONTHS[normalized_month]
            break

    if day is None:
        raise ValueError(f"Could not parse a day from: {value}")

    if month is None:
        if fallback_month is None:
            raise ValueError(f"Could not parse a month from: {value}")
        month = fallback_month

    return day, month


def expand_date_range(value: str, year: int) -> list[str]:
    normalized = normalize_digits(normalize_text(value))
    parts = [part.strip() for part in re.split(r"\s+-\s+", normalized) if part.strip()]

    if not parts:
        raise ValueError(f"Could not parse holiday date line: {value}")

    start_day, start_month = parse_date_part(parts[0])
    start_date = date(year, start_month, start_day)

    if len(parts) == 1:
        return [start_date.isoformat()]

    end_day, end_month = parse_date_part(parts[1], fallback_month=start_month)
    end_year = year + 1 if end_month < start_month else year
    end_date = date(end_year, end_month, end_day)

    if end_date < start_date:
        raise ValueError(f"Holiday range ends before it starts: {value}")

    current = start_date
    expanded: list[str] = []
    while current <= end_date:
        expanded.append(current.isoformat())
        current += timedelta(days=1)

    return expanded


def build_daily_entries(
    pairs: list[tuple[str, str]], year: int
) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for date_text, holiday_name in pairs:
        normalized_name = normalize_text(holiday_name)
        normalized_date_text = normalize_text(date_text)

        for iso_date in expand_date_range(date_text, year):
            key = (iso_date, normalized_name)
            if key in seen:
                continue

            seen.add(key)
            entries.append(
                {
                    "date": iso_date,
                    "name": normalized_name,
                    "source_text": normalized_date_text,
                }
            )

    entries.sort(key=lambda item: (item["date"], item["name"]))
    return entries


def parse_holidays(url: str) -> list[dict[str, str]]:
    html = fetch_html(url)
    soup = BeautifulSoup(html, "html.parser")
    year = extract_year(soup)
    pairs = extract_holiday_pairs(soup)

    if not pairs:
        raise RuntimeError("Could not find any holiday entries on the page.")

    return build_daily_entries(pairs, year)


def write_output(entries: list[dict[str, str]], output_path: Path) -> None:
    payload = {
        "last_updated": datetime.now(CAIRO_OFFSET).replace(microsecond=0).isoformat(),
        "holidays": entries,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Egypt presidency holidays and export them as daily ISO JSON entries."
    )
    parser.add_argument("--url", default=DEFAULT_URL, help="Holiday page URL to parse.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="JSON file path to write.",
    )
    args = parser.parse_args()

    entries = parse_holidays(args.url)
    write_output(entries, args.output)
    print(f"Wrote {len(entries)} entries to {args.output}")


if __name__ == "__main__":
    main()
