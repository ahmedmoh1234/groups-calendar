# Presidency Holidays Scraper

This folder contains a standalone Python scraper for the Egypt Presidency holidays page:

`https://www.presidency.eg/ar/%D9%85%D8%B5%D8%B1/%D8%A7%D9%84%D8%B9%D8%B7%D9%84%D8%A7%D8%AA-%D8%A7%D9%84%D8%B1%D8%B3%D9%85%D9%8A%D8%A9/`

It:

- fetches the page with a browser-like HTTP client
- parses holiday names and Arabic date text
- converts dates to ISO `YYYY-MM-DD`
- expands date ranges into one JSON entry per day
- adds a UTC `last_updated` timestamp to the output

## Setup

```bash
python -m pip install -r scripts/presidency_holidays/requirements.txt
```

## Run

```bash
python scripts/presidency_holidays/fetch_holidays.py
```

That writes `scripts/presidency_holidays/holidays.json`.

The output shape is:

```json
{
  "last_updated": "2026-04-07T12:34:56Z",
  "holidays": [
    {
      "date": "2026-01-07",
      "name": "عيد الميلاد المجيد",
      "source_text": "الأربعاء ٠٧ يناير"
    }
  ]
}
```

You can also choose a custom output path:

```bash
python scripts/presidency_holidays/fetch_holidays.py --output scripts/presidency_holidays/my-holidays.json
```

## Automation

GitHub Actions can refresh the JSON automatically with `.github/workflows/refresh-holidays.yml`.

- runs every day at `06:00` UTC
- can also be started manually with `workflow_dispatch`
- regenerates `scripts/presidency_holidays/holidays.json`
- commits the updated JSON back to the repository
