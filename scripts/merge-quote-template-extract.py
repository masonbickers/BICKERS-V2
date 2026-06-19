import json
import sys
from pathlib import Path


BASE = Path("outputs/quote-template-extract")
EXTRA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("outputs/pod-car-template-extract")


def load(path):
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):
        return data
    return [data]


def write(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def merge_by_file(base_rows, extra_rows):
    extra_files = {row.get("file") for row in extra_rows}
    merged = [row for row in base_rows if row.get("file") not in extra_files]
    merged.extend(extra_rows)
    return merged


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    workbooks = merge_by_file(load(BASE / "workbooks.json"), load(EXTRA / "workbooks.json"))
    line_items = merge_by_file(load(BASE / "line-items.json"), load(EXTRA / "line-items.json"))
    successful_files = {row.get("file") for row in workbooks}
    errors = [
        row
        for row in merge_by_file(load(BASE / "errors.json"), load(EXTRA / "errors.json"))
        if row.get("file") not in successful_files
    ]

    write(BASE / "workbooks.json", workbooks)
    write(BASE / "line-items.json", line_items)
    write(BASE / "errors.json", errors)
    print(json.dumps({
        "workbookCount": len(workbooks),
        "lineItemCount": len(line_items),
        "errorCount": len(errors),
    }, indent=2))


if __name__ == "__main__":
    main()
