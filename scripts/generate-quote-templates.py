import json
import re
from pathlib import Path


BASE = Path("outputs/quote-template-extract")
OUTPUT = Path("src/app/utils/quoteTemplates.js")


def load_json(name):
    return json.loads((BASE / name).read_text(encoding="utf-8-sig"))


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def slugify(value):
    text = clean_text(value).lower()
    text = re.sub(r"\.xls[x]?$", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "quote-template"


def is_charge_row(row):
    desc = clean_text(row.get("description"))
    if not desc or desc.upper() in {"DESCRIPTION", "TOTAL"}:
        return False
    if row.get("isSectionOrHeader"):
        return False
    return bool(row.get("unitPrice") or row.get("totalFormula") or row.get("total"))


def total_mode(row):
    total = clean_text(row.get("total")).lower()
    unit = clean_text(row.get("unitPrice")).lower()
    if "production" in total or "production" in unit:
        return "production"
    if "tbc" in total or "tbc" in unit:
        return "tbc"
    return "auto"


def build_templates():
    workbooks = load_json("workbooks.json")
    rows = load_json("line-items.json")
    rows_by_file = {}
    for row in rows:
        rows_by_file.setdefault(row.get("file"), []).append(row)

    templates = []
    seen_ids = set()
    for workbook in workbooks:
        file_name = workbook.get("file") or ""
        header = workbook.get("header") or {}
        template_id = slugify(file_name)
        if template_id in seen_ids:
            suffix = 2
            while f"{template_id}-{suffix}" in seen_ids:
                suffix += 1
            template_id = f"{template_id}-{suffix}"
        seen_ids.add(template_id)

        line_items = []
        for row in rows_by_file.get(file_name, []):
            if not is_charge_row(row):
                continue
            line_items.append(
                {
                    "section": clean_text(row.get("section")),
                    "description": clean_text(row.get("description")),
                    "qty": clean_text(row.get("qty")),
                    "unitPrice": clean_text(row.get("unitPrice")),
                    "totalMode": total_mode(row),
                    "sourceRow": row.get("row"),
                }
            )

        templates.append(
            {
                "id": template_id,
                "file": file_name,
                "serviceDescription": clean_text(header.get("serviceDescription")) or file_name,
                "defaultBickersContact": clean_text(header.get("bickersContact")),
                "lineItems": line_items,
            }
        )

    return templates


def main():
    templates = build_templates()
    content = [
        "// Generated from outputs/quote-template-extract on 2026-06-15.\n",
        "export const FULL_SIZE_TRACKING_QUOTE_TEMPLATES = ",
        json.dumps(templates, indent=2, ensure_ascii=False),
        ";\n",
        "export const quoteTemplateOptions = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.map((template) => ({",
        "  id: template.id,",
        "  label: template.serviceDescription || template.file,",
        "  file: template.file,",
        "}));",
        "",
    ]
    OUTPUT.write_text("".join(content), encoding="utf-8")
    print(json.dumps({"templateCount": len(templates), "output": str(OUTPUT)}, indent=2))


if __name__ == "__main__":
    main()
