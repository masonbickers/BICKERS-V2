import csv
import json
import re
from collections import defaultdict
from pathlib import Path


BASE = Path("outputs/quote-template-extract")


def load_json(name):
    return json.loads((BASE / name).read_text(encoding="utf-8-sig"))


def clean_money(value):
    text = str(value or "").strip()
    if not text or text.upper() in {"TBC", "PRODUCTION", "LESS", "-"}:
        return None
    text = text.replace(",", "").replace("£", "").replace("Ł", "")
    if text.endswith("%"):
        try:
            return float(text[:-1]) / 100
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None


def norm_desc(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def is_rate_row(row):
    desc = norm_desc(row.get("description"))
    if not desc or desc.upper() in {"DESCRIPTION", "TOTAL"}:
        return False
    if row.get("isSectionOrHeader"):
        return False
    return bool(row.get("unitPrice") or row.get("totalFormula") or row.get("total"))


def main():
    workbooks = load_json("workbooks.json")
    rows = load_json("line-items.json")

    rates = []
    seen = set()
    for row in rows:
        if not is_rate_row(row):
            continue
        unit = clean_money(row.get("unitPrice"))
        key = (
            norm_desc(row.get("description")).lower(),
            str(row.get("unitPrice") or "").strip(),
            norm_desc(row.get("section")).lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        rates.append(
            {
                "section": norm_desc(row.get("section")),
                "description": norm_desc(row.get("description")),
                "unitPrice": row.get("unitPrice") or "",
                "unitPriceNumber": unit if unit is not None else "",
                "exampleFile": row.get("file"),
                "row": row.get("row"),
            }
        )

    grouped_rates = defaultdict(list)
    for rate in rates:
        section = rate["section"] or "Unsectioned"
        grouped_rates[section].append(rate)

    with (BASE / "deduped-rates.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["section", "description", "unitPrice", "unitPriceNumber", "exampleFile", "row"],
        )
        writer.writeheader()
        writer.writerows(rates)

    lines = []
    lines.append("# Full Size Tracking Quote Template Extraction")
    lines.append("")
    lines.append(f"- Templates extracted: {len(workbooks)}")
    lines.append(f"- Quote rows extracted: {len(rows)}")
    lines.append(f"- Deduplicated rate rows: {len(rates)}")
    lines.append("")
    lines.append("## Templates")
    lines.append("")
    for wb in workbooks:
        header = wb.get("header", {})
        lines.append(f"- **{wb['file']}**: {header.get('serviceDescription') or '-'}")
    lines.append("")

    lines.append("## Common Quote Structure")
    lines.append("")
    lines.append("- Header cells: quote date, job no, quote no, production company, production, contact, location, shoot dates, Bickers contact.")
    lines.append("- Line-item grid: `DESCRIPTION`, `QTY`, `UNIT PRICE`, `TOTAL`.")
    lines.append("- Main sections: equipment daily rates, labour daily rates, travel charges, accommodation/meals, discounts, total price.")
    lines.append("- Most charge rows calculate as `QTY * UNIT PRICE`; optional rows use `TBC`, `Production`, or blank quantity.")
    lines.append("- Footer total generally sums the charge rows and excludes VAT.")
    lines.append("")

    lines.append("## Rate Highlights")
    lines.append("")
    important_terms = [
        "Tracking Vehicle",
        "Driver/Technician",
        "Overtime",
        "Saturday",
        "Sunday",
        "Bank Holiday",
        "Late Working",
        "Turnaround",
        "Recce",
        "Transport Vehicle",
        "Mileage",
        "Travel Days",
        "Travel Time",
        "Congestion",
        "ULEZ",
        "Hotel",
        "Meal",
        "Riggers",
        "Discount",
    ]
    for term in important_terms:
        matches = [r for r in rates if term.lower() in r["description"].lower()]
        if not matches:
            continue
        lines.append(f"### {term}")
        for item in matches[:12]:
            lines.append(
                f"- {item['description']} | unit {item['unitPrice'] or '-'} | from {item['exampleFile']}"
            )
        if len(matches) > 12:
            lines.append(f"- ...and {len(matches) - 12} more in `deduped-rates.csv`")
        lines.append("")

    lines.append("## Build Notes")
    lines.append("")
    lines.append("- The system can create quotes from templates by copying the matching vehicle template and filling header + quantities.")
    lines.append("- A better long-term setup is a quote-template table plus editable line items, because many templates share the same labour/travel rules.")
    lines.append("- Still needed from the business side: vehicle-to-template mapping, quote-number generation rules, and which optional/TBC lines should be included by default.")
    lines.append("")

    (BASE / "summary.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
