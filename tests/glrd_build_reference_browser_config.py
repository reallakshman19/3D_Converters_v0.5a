#!/usr/bin/env python3
"""Generate a deterministic GLRD browser Preview config from pinned source masters.

Do not interpret the resulting config as the owner's unprovided UI overrides.
Report all sheet/header decisions and master row counts for review.
"""
import argparse
import json
from datetime import date, datetime
from pathlib import Path
from openpyxl import load_workbook


def txt(value):
    return str(value).strip() if value is not None else ""


def serializable(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def line_list_rows(path):
    book = load_workbook(path, read_only=True, data_only=True)
    candidates = []
    for sheet in book.worksheets:
        head = []
        for row in sheet.iter_rows(max_row=min(sheet.max_row, 60), values_only=True):
            head.append(tuple(row))
        for offset, row in enumerate(head):
            keys = [txt(value) for value in row]
            tokens = [k.lower().replace("_", " ").replace("-", " ") for k in keys]
            line_cols = [k for k in tokens if "line" in k and ("no" in k or "num" in k or "sequence" in k or "seq" in k)]
            score = 25 * len(line_cols) + sum(("from" in k) + ("to" == k) + ("class" in k) for k in tokens)
            score += min(sum(bool(k) for k in keys), 20)
            if score > 25 and len(set(k for k in keys if k)) >= 4:
                candidates.append((score, sheet.title, offset, keys))
    if not candidates:
        raise RuntimeError("Could not locate a credible line-list header row in the supplied XLSX")
    score, title, start, keys = max(candidates, key=lambda item: (item[0], -item[2]))
    sheet = book[title]
    names = []
    seen = {}
    for idx, raw in enumerate(keys):
        name = raw or "column_" + str(idx + 1)
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = name + "__" + str(seen[name])
        names.append(name)
    records = []
    for row in sheet.iter_rows(min_row=start + 2, values_only=True):
        if all(value is None or txt(value) == "" for value in row):
            continue
        record = {name: serializable(row[index]) if index < len(row) else None
                  for index, name in enumerate(names) if name and index < len(row)}
        records.append(record)
    if len(records) < 22:
        raise RuntimeError("Unexpectedly few line-list rows: " + str(len(records)))
    return records, {"sheet": title, "headerRow": start + 1, "columns": names,
                     "rows": len(records), "selectionScore": score, "sheets": book.sheetnames}


def rows_json(path):
    obj = json.loads(Path(path).read_text(encoding="utf8"))
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        for name in ("rows", "data", "masterRows", "pipingClassMaster"):
            if isinstance(obj.get(name), list):
                return obj[name]
    raise RuntimeError("Master is not an array and no recognized rows key exists: " + str(path))


def material_mapping(text):
    out = []
    for line in text.splitlines():
        bits = line.split(maxsplit=1)
        if len(bits) == 2 and bits[0].isdigit() and int(bits[0]) < 5000:
            out.append({"Material Code": bits[0], "Material Name": bits[1],
                        "code": bits[0], "material": bits[1]})
    return out


def main():
    parser = argparse.ArgumentParser()
    for key in ("line-list", "piping-class", "weight", "material-map", "defaults", "out", "report"):
        parser.add_argument("--" + key, required=True)
    args = vars(parser.parse_args())
    line_rows, sheet_report = line_list_rows(args["line_list"])
    class_rows = rows_json(args["piping_class"])
    weight_rows = rows_json(args["weight"])
    material_text = Path(args["material_map"]).read_text(encoding="utf8")
    material_rows = material_mapping(material_text)
    config = json.loads(Path(args["defaults"]).read_text(encoding="utf8"))
    config["linelist"] = {**config.get("linelist", {}), "masterRows": line_rows}
    config["pipingClass"] = {**config.get("pipingClass", {}), "masterRows": class_rows}
    config["weight"] = {**config.get("weight", {}), "masterRows": weight_rows}
    config["material"] = {**config.get("material", {}), "mapRows": material_rows}
    config["overrides"] = {}
    config["manualFacts"] = []
    Path(args["out"]).write_text(json.dumps(config, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    report = {"schema": "glrd-reference-browser-config-v1",
              "lineList": sheet_report,
              "pipingClassRows": len(class_rows),
              "weightRows": len(weight_rows),
              "materialMapRows": len(material_rows),
              "manualOverrides": "explicit empty",
              "basis": "pinned source masters with default standalone support config; NOT owner live browser imported config"}
    Path(args["report"]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report, indent=2))
    if len(class_rows) < 1000 or len(weight_rows) < 100:
        raise RuntimeError("Master records unexpectedly incomplete")


if __name__ == "__main__":
    main()
