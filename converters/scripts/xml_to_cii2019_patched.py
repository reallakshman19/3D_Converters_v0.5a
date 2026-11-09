#!/usr/bin/env python3
"""Patched PSI116 XML -> CII(2019) converter wrapper.

Final-stage enrichment wrapper for XML->CII(2019): line-list semantic
mapping, DTXR restraint derivation, hydro pressure, insulation density,
optional condensed valve/flange split, and CII element-row case values.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import xml_to_cii2019 as base

try:
    import xml_to_cii2019_master_addon as addon
except Exception:  # pragma: no cover
    addon = None

SENTINEL_TEMPERATURE = -100000.0
NO_AUTO_WEIGHT_COMPONENT_TYPES = {"TEE", "REDU", "REE", "BEND", "ELBO"}
RENUMBERABLE_NEGATIVE_TYPES = {"FLAN", "RIGID"}

DEFAULT_SUPPORT_CONFIG: dict[str, Any] = {
    "useFrictionSentinelForNonYSupports": True,
    "convertDensityKgM3ToKgCm3": True,
    "disableCiiSupportTagPopulation": False,
    "supportKindToXmlType": {"REST": "+Y", "SHOE": "+Y", "GUIDE": "GUI", "LINESTOP": "LIM", "LIMIT": "LIM", "ANCHOR": "ANC", "SPRING": "YSPR"},
    "defaultStiffness": "1.751270E+12",
    "defaultGap": "0",
    "defaultFriction": "0.3",
    "insulationDensityDefault": 210,
    "splitCondensedValveFlange": True,
    "keywordRules": [
        {"kind": "GUIDE", "patterns": [r"\bGUIDE\b", r"\bGUI\b", r"\bPDO-TYPE-603\b"]},
        {"kind": "LINESTOP", "patterns": [r"\bLINE\s*STOP\b", r"\bLINESTOP\b", r"\bLIMIT\s*STOP\b", r"\bAXIAL\s*STOP\b", r"\bDIRECTIONAL\s+ANCHOR\b"]},
        {"kind": "REST", "patterns": [r"\bREST\b", r"\bSHOE\b", r"\bSADDLE\b", r"\bWEAR\s+PLATE\b", r"\bPAD\b"]},
        {"kind": "ANCHOR", "patterns": [r"\bANCHOR\b"]},
        {"kind": "SPRING", "patterns": [r"\bSPRING\b", r"\bHANGER\b"]},
    ],
}

SUPPORT_KIND_TO_XML_TYPE = {"REST": "+Y", "SHOE": "+Y", "GUIDE": "GUI", "LINESTOP": "LIM", "LIMIT": "LIM", "ANCHOR": "ANC", "SPRING": "YSPR"}
SUPPORT_KIND_TO_CII_CODE = {"REST": 14, "SHOE": 14, "GUIDE": 8, "LINESTOP": 9, "LIMIT": 9, "ANCHOR": 1, "SPRING": 55}


def _safe_text(value: object) -> str:
    return "" if value is None else str(value).strip()


def _truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return _safe_text(value).lower() in {"1", "true", "yes", "on"}


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def _namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") else ""


def _q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}" if namespace else name


def _child_text(parent: ET.Element, namespace: str, name: str) -> str:
    child = parent.find(_q(namespace, name))
    return _safe_text(child.text if child is not None else "")


def _ensure_child(parent: ET.Element, namespace: str, name: str) -> ET.Element:
    child = parent.find(_q(namespace, name))
    if child is None:
        child = ET.Element(_q(namespace, name))
        parent.append(child)
    return child


def _set_child(parent: ET.Element, namespace: str, name: str, value: object) -> None:
    _ensure_child(parent, namespace, name).text = _safe_text(value)


def _to_float(value: object, fallback: float) -> float:
    try:
        number = float(_safe_text(value))
        return number if math.isfinite(number) else fallback
    except (TypeError, ValueError):
        return fallback


def _numeric_token(value: object) -> str:
    match = re.search(r"-?\d+(?:\.\d+)?", _safe_text(value).replace(",", ""))
    return match.group(0) if match else ""


def _numeric_text(value: object) -> float | None:
    token = _numeric_token(value)
    if not token:
        return None
    try:
        return float(token)
    except ValueError:
        return None


def _load_support_config(raw_json: str | None) -> dict[str, Any]:
    cfg = json.loads(json.dumps(DEFAULT_SUPPORT_CONFIG))
    if _safe_text(raw_json):
        user_cfg = json.loads(_safe_text(raw_json))
        if not isinstance(user_cfg, dict):
            raise ValueError("--support-config-json must be a JSON object.")
        for key, value in user_cfg.items():
            if isinstance(value, dict) and isinstance(cfg.get(key), dict):
                cfg[key].update(value)
            else:
                cfg[key] = value
    cfg.setdefault("supportKindToXmlType", {})["REST"] = "+Y"
    cfg["supportKindToXmlType"]["SHOE"] = "+Y"
    cfg["splitCondensedValveFlange"] = _truthy(cfg.get("splitCondensedValveFlange"))
    cfg["useFrictionSentinelForNonYSupports"] = _truthy(cfg.get("useFrictionSentinelForNonYSupports") if cfg.get("useFrictionSentinelForNonYSupports") is not None else True)
    cfg["convertDensityKgM3ToKgCm3"] = _truthy(cfg.get("convertDensityKgM3ToKgCm3") if cfg.get("convertDensityKgM3ToKgCm3") is not None else True)
    cfg["disableCiiSupportTagPopulation"] = _truthy(cfg.get("disableCiiSupportTagPopulation", False))
    return cfg


def _friction_for_xml_restraint(xml_type: str, support_config: dict[str, Any]) -> str:
    if _truthy(support_config.get("useFrictionSentinelForNonYSupports", True)) and xml_type != "+Y":
        return "-1.0101"
    return _safe_text(support_config.get("defaultFriction", "0.3"))


def _cii_friction_value(raw_friction: float, support_config: dict[str, Any]) -> float:
    if abs(raw_friction - (-1.0101)) < 1e-6:
        return 0.0
    return raw_friction


def _density_for_output(value: float, support_config: dict[str, Any]) -> float:
    if _truthy(support_config.get("convertDensityKgM3ToKgCm3", True)):
        return value / 1000000.0
    return value


def _norm_header(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _safe_text(value).lower()).strip()


def _row_value(row: dict[str, Any] | None, key: str) -> str:
    if not isinstance(row, dict) or not key:
        return ""
    if _safe_text(row.get(key)):
        return _safe_text(row.get(key))
    raw = row.get("_raw")
    if isinstance(raw, dict) and _safe_text(raw.get(key)):
        return _safe_text(raw.get(key))
    return ""


def _candidate_headers_from_rows(rows: list[dict[str, Any]]) -> list[str]:
    headers: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in row.keys():
            if key == "_raw" and isinstance(row.get("_raw"), dict):
                for raw_key in row["_raw"].keys():
                    if raw_key not in seen:
                        seen.add(raw_key)
                        headers.append(raw_key)
            elif key not in seen:
                seen.add(key)
                headers.append(key)
    return headers


def _sample_labels_for_header(rows: list[dict[str, Any]], header: str, limit: int = 4) -> list[str]:
    labels = [header]
    for row in rows[:limit]:
        value = _row_value(row, header)
        if value and value not in labels:
            labels.append(value)
    return labels


def _semantic_score(header: str, labels: list[str], target: str) -> int:
    joined = " ".join(_norm_header(v) for v in labels if _safe_text(v))
    compact = joined.replace(" ", "")
    if not joined:
        return 0
    has_temp = bool(re.search(r"\b(temp|temperature)\b", joined)) or "temperature" in compact or "temp" in compact
    has_pressure = bool(re.search(r"\b(press|pressure|kpa|bar|psig?)\b", joined))
    has_test = bool(re.search(r"\b(test|hydro|hydrostatic)\b", joined)) or "testpressure" in compact or "hydropressure" in compact
    has_max = bool(re.search(r"\b(max|maximum)\b", joined)) or "tempmax" in compact or "temperaturemax" in compact
    has_min = bool(re.search(r"\b(min|minimum)\b", joined)) or "tempmin" in compact or "temperaturemin" in compact
    has_ins = bool(re.search(r"\b(ins|insulation)\b", joined))
    has_thk = bool(re.search(r"\b(thickness|thk|mm)\b", joined))
    has_type = bool(re.search(r"\btype\b", joined))
    has_density = bool(re.search(r"\bdensity\b", joined)) or bool(re.search(r"\bkg\b.*\bm\b", joined)) or "kg/m" in joined
    has_gas = bool(re.search(r"\bgas\b", joined))
    has_mixed = bool(re.search(r"\bmixed\b", joined))
    has_liquid = bool(re.search(r"\b(liquid|liq)\b", joined))
    if target == "t1":
        return 100 if has_temp and has_max and not has_pressure else 0
    if target == "t2":
        return 95 if has_temp and not has_max and not has_min and not has_pressure else 0
    if target == "t3":
        return 100 if has_temp and has_min and not has_pressure else 0
    if target == "hydroPressure":
        return 100 if has_pressure and has_test else 0
    if target == "insThk":
        return 100 if has_ins and has_thk and not has_type else 0
    if target == "densityMixed":
        return 100 if has_mixed and has_density else 0
    if target == "densityGas":
        return 100 if has_gas and has_density else 0
    if target == "densityLiquid":
        return 100 if has_liquid and has_density else 0
    return 0


def _normalize_process_field_map(config: dict[str, Any]) -> None:
    linelist = config.setdefault("linelist", {}) if isinstance(config.get("linelist"), dict) else {}
    rows = linelist.get("masterRows")
    if not isinstance(rows, list):
        return
    field_map = linelist.setdefault("fieldMap", {})
    for target in ("t1", "t2", "t3", "hydroPressure", "insThk", "densityMixed", "densityGas", "densityLiquid"):
        best_header = ""
        best_score = 0
        for header in _candidate_headers_from_rows(rows):
            score = _semantic_score(header, _sample_labels_for_header(rows, header), target)
            if score > best_score:
                best_score = score
                best_header = header
        if best_header and best_score >= 90:
            field_map[target] = best_header


def _line_key_from_branch(branch_name: str, config: dict[str, Any]) -> str:
    linelist = config.get("linelist", {}) if isinstance(config.get("linelist"), dict) else {}
    cleaned = branch_name.strip().lstrip("/").split("/")[0]
    parts = [p.strip() for p in cleaned.split(_safe_text(linelist.get("tokenDelimiter")) or "-") if p.strip()]
    selected: list[str] = []
    for part in re.split(r"[,+]", _safe_text(linelist.get("lineKeyTokenPositions") or "4")):
        try:
            idx = int(part.strip()) - 1
        except ValueError:
            continue
        if 0 <= idx < len(parts):
            selected.append(parts[idx])
    if selected:
        return re.sub(r"\s+", "", "".join(selected).upper())
    return ""


def _line_key_from_row(row: dict[str, Any], config: dict[str, Any]) -> str:
    field_map = config.get("linelist", {}).get("fieldMap", {}) if isinstance(config.get("linelist"), dict) else {}
    for key in [field_map.get("lineSeqNo"), field_map.get("lineKey1"), "lineNo", "lineKey", "lineSeqNo", "Line No", "Line Number", "ColumnX1"]:
        value = _row_value(row, _safe_text(key))
        if value:
            return re.sub(r"\s+", "", value.upper())
    return ""


def _matching_linelist_rows(line_key: str, config: dict[str, Any]) -> list[dict[str, Any]]:
    rows = config.get("linelist", {}).get("masterRows", []) if isinstance(config.get("linelist"), dict) else []
    wanted = re.sub(r"\s+", "", line_key.upper())
    return [row for row in rows if isinstance(row, dict) and _line_key_from_row(row, config) == wanted]


def _mapped_process_value(line_key: str, config: dict[str, Any], field: str, fallbacks: list[str]) -> str:
    field_map = config.get("linelist", {}).get("fieldMap", {}) if isinstance(config.get("linelist"), dict) else {}
    keys = [_safe_text(field_map.get(field)) if isinstance(field_map, dict) else "", field, field.upper(), *fallbacks]
    values: list[str] = []
    for row in _matching_linelist_rows(line_key, config):
        for key in keys:
            value = _row_value(row, key)
            if value:
                values.append(value)
                break
    numeric_values = [_numeric_token(value) for value in values if _numeric_token(value)]
    if numeric_values:
        return numeric_values[-1] if field in {"t3", "densityMixed"} else numeric_values[0]
    return values[0] if values else ""


def _branch_nodes(branch: ET.Element, namespace: str) -> list[ET.Element]:
    return [node for node in list(branch) if _local_name(node.tag) == "Node"]


def _kind_from_dtxr(text: str, support_config: dict[str, Any]) -> list[str]:
    normalized = _safe_text(text).upper()
    if not normalized:
        return []
    kinds: list[str] = []
    rules = support_config.get("keywordRules") if isinstance(support_config.get("keywordRules"), list) else DEFAULT_SUPPORT_CONFIG["keywordRules"]
    for rule in rules:
        kind = _safe_text(rule.get("kind")).upper() if isinstance(rule, dict) else ""
        patterns = rule.get("patterns") if isinstance(rule, dict) else None
        if not kind or not isinstance(patterns, list):
            continue
        for pattern in patterns:
            try:
                matched = re.search(str(pattern), normalized, flags=re.I) is not None
            except re.error:
                matched = str(pattern).upper() in normalized
            if matched:
                if kind not in kinds:
                    kinds.append(kind)
                break
    if "LINESTOP" in kinds and "ANCHOR" in kinds:
        kinds = [kind for kind in kinds if kind != "ANCHOR"]
    return kinds


def _xml_types_from_dtxr(text: str, support_config: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for kind in _kind_from_dtxr(text, support_config):
        xml_type = SUPPORT_KIND_TO_XML_TYPE.get(kind, kind)
        if xml_type and xml_type not in out:
            out.append(xml_type)
    return out


def _apply_dtxr_restraints_to_node(node: ET.Element, namespace: str, support_config: dict[str, Any], use_dtxr_only: bool = True) -> bool:
    text = " | ".join(filter(None, [_child_text(node, namespace, "DTXR_POS"), _child_text(node, namespace, "DTXR_PS")]))
    xml_types = _xml_types_from_dtxr(text, support_config)
    if not xml_types:
        return False
    existing = [child for child in list(node) if _local_name(child.tag) == "Restraint"]
    keep: list[str] = []
    if not use_dtxr_only:
        keep = [_child_text(rest, namespace, "Type") for rest in existing if _child_text(rest, namespace, "Type")]
    for restraint in existing:
        node.remove(restraint)
    for xml_type in [*keep, *xml_types]:
        restraint = ET.Element(_q(namespace, "Restraint"))
        _set_child(restraint, namespace, "Type", xml_type)
        _set_child(restraint, namespace, "Stiffness", support_config.get("defaultStiffness", "1.751270E+12"))
        _set_child(restraint, namespace, "Gap", support_config.get("defaultGap", "0"))
        _set_child(restraint, namespace, "Friction", _friction_for_xml_restraint(xml_type, support_config))
        node.append(restraint)
    return True


def _renumber_length_bearing_negative_nodes(root: ET.Element, namespace: str) -> bool:
    branches = [branch for branch in root.iter() if _local_name(branch.tag) == "Branch"]
    branch_nodes = [_branch_nodes(branch, namespace) for branch in branches]
    original_numbers = {id(node): _numeric_text(_child_text(node, namespace, "NodeNumber")) for nodes in branch_nodes for node in nodes}
    used = {int(round(value)) for value in original_numbers.values() if value is not None and value > 0}
    fallback = 10000
    changed = False
    for nodes in branch_nodes:
        for idx, node in enumerate(nodes):
            node_no = original_numbers.get(id(node))
            comp = _child_text(node, namespace, "ComponentType").upper()
            elem_len = _numeric_text(_child_text(node, namespace, "ElementLengthMm"))
            if node_no is None or int(round(node_no)) >= 0 or comp not in RENUMBERABLE_NEGATIVE_TYPES or elem_len is None or elem_len <= 0:
                continue
            prev_num = next((int(round(v)) for p in reversed(nodes[:idx]) for v in [original_numbers.get(id(p))] if v is not None and v > 0), None)
            next_num = next((int(round(v)) for n in nodes[idx + 1:] for v in [original_numbers.get(id(n))] if v is not None and v > 0), None)
            candidates = [c for c in ((next_num - 1 if next_num else None), (prev_num + 1 if prev_num else None)) if c and c > 0]
            assigned = next((candidate for candidate in candidates if candidate not in used), None)
            if assigned is None:
                while fallback in used:
                    fallback += 10
                assigned = fallback
                fallback += 10
            _set_child(node, namespace, "NodeNumber", assigned)
            used.add(assigned)
            changed = True
    return changed


def _apply_process_data_to_xml(xml_path: Path, support_config: dict[str, Any]) -> Path:
    _normalize_process_field_map(support_config)
    tree = ET.parse(xml_path)
    root = tree.getroot()
    namespace = _namespace(root.tag)
    if namespace:
        ET.register_namespace("", namespace)
    changed = False
    skip_dtxr_restraint_fallback = _xml_restraints_are_authoritative(xml_path, support_config)
    insulation_density_default = _to_float(support_config.get("insulationDensityDefault"), 210.0)
    for branch in root.iter():
        if _local_name(branch.tag) != "Branch":
            continue
        pressure = _ensure_child(branch, namespace, "Pressure")
        line_key = _line_key_from_branch(_child_text(branch, namespace, "Branchname"), support_config)
        hydro = ""
        if _matching_linelist_rows(line_key, support_config):
            temperature = _ensure_child(branch, namespace, "Temperature")
            values = {
                "Pressure1": _mapped_process_value(line_key, support_config, "p1", ["P1", "Design Pressure", "Operating Pressure"]),
                "Temperature1": _mapped_process_value(line_key, support_config, "t1", ["T1", "Temp Max", "Temperature Max"]),
                "Temperature2": _mapped_process_value(line_key, support_config, "t2", ["T2", "Temp", "Temperature"]),
                "Temperature3": _mapped_process_value(line_key, support_config, "t3", ["T3", "Temp Min", "Temperature Min"]),
            }
            hydro = _mapped_process_value(line_key, support_config, "hydroPressure", ["HydroPressure", "Hydro Pressure", "Hydro Test Pressure", "Test Pressure"])
            density = (_mapped_process_value(line_key, support_config, "densityMixed", ["Mixed kg/m3", "Mixed kg/m³", "Density Mixed"])
                       or _mapped_process_value(line_key, support_config, "densityGas", ["Gas kg/m3", "Gas kg/m³", "Density Gas"])
                       or _mapped_process_value(line_key, support_config, "densityLiquid", ["Liquid kg/m3", "Liquid kg/m³", "Density Liquid"]))
            if values["Pressure1"]:
                _set_child(pressure, namespace, "Pressure1", values["Pressure1"]); changed = True
            for tag in ("Temperature1", "Temperature2", "Temperature3"):
                if values[tag]:
                    _set_child(temperature, namespace, tag, values[tag]); changed = True
            if density:
                _set_child(branch, namespace, "FluidDensity", density); changed = True
        _set_child(pressure, namespace, "HydroPressure", hydro if hydro else _child_text(pressure, namespace, "HydroPressure") or 0)
        changed = True
        max_insulation = _numeric_text(_child_text(branch, namespace, "InsulationThickness")) or 0.0
        for node in _branch_nodes(branch, namespace):
            max_insulation = max(max_insulation, _numeric_text(_child_text(node, namespace, "InsulationThickness")) or 0.0)
            if _child_text(node, namespace, "ComponentType").upper() in NO_AUTO_WEIGHT_COMPONENT_TYPES and (_numeric_text(_child_text(node, namespace, "Weight")) or 0.0) != 0.0:
                _set_child(node, namespace, "Weight", "0"); changed = True
            has_explicit_restraints = any(_local_name(child.tag) == "Restraint" for child in list(node))
            if not skip_dtxr_restraint_fallback and not has_explicit_restraints and _apply_dtxr_restraints_to_node(node, namespace, support_config, use_dtxr_only=True):
                changed = True
        _set_child(branch, namespace, "InsulationDensity", insulation_density_default if max_insulation >= 50.0 else 0)
        changed = True
    if _truthy(support_config.get("splitCondensedValveFlange")) and _renumber_length_bearing_negative_nodes(root, namespace):
        changed = True
    if not changed:
        return xml_path
    temp_path = Path(tempfile.gettempdir()) / f"{xml_path.stem}_final_enriched.xml"
    tree.write(temp_path, encoding="unicode", xml_declaration=False)
    return temp_path


def _branch_insulation_density_map(xml_path: Path) -> dict[str, float]:
    root = ET.parse(xml_path).getroot()
    namespace = _namespace(root.tag)
    return {_child_text(branch, namespace, "Branchname"): _to_float(_child_text(branch, namespace, "InsulationDensity"), 0.0) for branch in root.iter() if _local_name(branch.tag) == "Branch"}


def _branch_hydro_pressure_map(xml_path: Path) -> dict[str, float]:
    root = ET.parse(xml_path).getroot()
    namespace = _namespace(root.tag)
    out: dict[str, float] = {}
    for branch in root.iter():
        if _local_name(branch.tag) != "Branch":
            continue
        pressure = branch.find(_q(namespace, "Pressure"))
        out[_child_text(branch, namespace, "Branchname")] = _to_float(_child_text(pressure, namespace, "HydroPressure") if pressure is not None else "", 0.0)
    return out


def _parse_cmpsupgap_value(text: str) -> float | None:
    match = re.search(r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?", _safe_text(text))
    if not match:
        return None
    value = float(match.group(0))
    return value if math.isfinite(value) else None


def _parse_cmpsupgap_from_dtxr_entry(entry_text: str) -> float | None:
    """Extract CMPSUPGAP value from an annotated DTXR entry.

    Handles entries of the form:
      'GUIDE PDO-TYPE-603(NAME=/PS-14340.13,CMPSUPGAP=15mm)'
    Returns the numeric mm value, or None if not present.
    """
    match = re.search(r'CMPSUPGAP\s*=\s*([^,)\s]+)', _safe_text(entry_text), re.IGNORECASE)
    if not match:
        return None
    return _parse_cmpsupgap_value(match.group(1))


def _restraint_type_uses_gap(type_text: str) -> bool:
    try:
        return int(round(base._restraint_type_to_code(type_text))) == SUPPORT_KIND_TO_CII_CODE["LINESTOP"]
    except Exception:
        return False


def _line_stop_gap_for_node(node: ET.Element, namespace: str) -> float | None:
    for restraint in node.findall(_q(namespace, "Restraint")):
        if not _restraint_type_uses_gap(_child_text(restraint, namespace, "Type")):
            continue
        for name in ("CMPSUPGAP", "Gap"):
            parsed = _parse_cmpsupgap_value(_child_text(restraint, namespace, name))
            if parsed is not None:
                return parsed
    return None


def _specs_from_dtxr_text(text: str, support_config: dict[str, Any], gap_by_kind: dict[str, float] | None = None) -> tuple[base.RestraintSpec, ...]:
    stiffness = _to_float(support_config.get("defaultStiffness"), base.DEFAULT_LINEAR_STIFFNESS)
    default_gap = _to_float(support_config.get("defaultGap"), 0.0)
    friction = _to_float(support_config.get("defaultFriction"), 0.3)
    specs: list[base.RestraintSpec] = []
    seen: set[int] = set()
    for kind in _kind_from_dtxr(text, support_config):
        code = SUPPORT_KIND_TO_CII_CODE.get(kind)
        if code is None:
            code = base._restraint_type_to_code(SUPPORT_KIND_TO_XML_TYPE.get(kind, kind))
        xml_type = SUPPORT_KIND_TO_XML_TYPE.get(kind, kind)
        spec_friction = -1.0101 if (_truthy(support_config.get("useFrictionSentinelForNonYSupports", True)) and xml_type != "+Y") else friction
        spec_gap = (gap_by_kind or {}).get(kind, default_gap)
        if code not in seen:
            seen.add(code)
            specs.append(base.RestraintSpec(type_code=code, stiffness=stiffness, gap=spec_gap, friction=spec_friction, is_open_end=False))
    return tuple(specs)


def _node_dtxr_texts(xml_path: Path) -> dict[int, str]:
    root = ET.parse(xml_path).getroot()
    namespace = _namespace(root.tag)
    out: dict[int, str] = {}
    for node in root.iter():
        if _local_name(node.tag) != "Node":
            continue
        node_no = base._parse_optional_int(_child_text(node, namespace, "NodeNumber"), "Node/NodeNumber")
        if node_no is None or node_no <= 0:
            continue
        text = " | ".join(filter(None, [_child_text(node, namespace, "DTXR_POS"), _child_text(node, namespace, "DTXR_PS")]))
        if text:
            out[node_no] = text
    return out


def _build_keyword_restraint_specs(xml_path: Path, support_config: dict[str, Any]) -> tuple[dict[int, tuple[base.RestraintSpec, ...]], dict[str, str]]:
    specs_by_node: dict[int, tuple[base.RestraintSpec, ...]] = {}
    support_map: dict[str, str] = {}
    node_gaps: dict[int, float] = {}
    root = ET.parse(xml_path).getroot()
    namespace = _namespace(root.tag)
    for node in root.iter():
        if _local_name(node.tag) != "Node":
            continue
        node_no = base._parse_optional_int(_child_text(node, namespace, "NodeNumber"), "Node/NodeNumber")
        if node_no is None or node_no <= 0:
            continue
        gap = _line_stop_gap_for_node(node, namespace)
        if gap is not None:
            node_gaps[node_no] = gap
    for node_no, text in _node_dtxr_texts(xml_path).items():
        gap_by_kind: dict[str, float] = {}
        if node_no in node_gaps:
            gap_by_kind["LINESTOP"] = node_gaps[node_no]
            gap_by_kind["LIMIT"] = node_gaps[node_no]
        # Extract per-entry CMPSUPGAP from annotated DTXR_POS entries:
        # e.g. "GUIDE PDO-TYPE-603(NAME=/PS-14340.13,CMPSUPGAP=15mm) | Directional Anchor...(NAME=...,CMPSUPGAP=0)"
        for entry in text.split("|"):
            entry_gap = _parse_cmpsupgap_from_dtxr_entry(entry.strip())
            if entry_gap is None:
                continue
            for kind in _kind_from_dtxr(entry.strip(), support_config):
                if kind not in gap_by_kind:  # node-level gap takes precedence
                    gap_by_kind[kind] = entry_gap
        specs = _specs_from_dtxr_text(text, support_config, gap_by_kind if gap_by_kind else None)
        if specs:
            specs_by_node[node_no] = specs
            kinds = _kind_from_dtxr(text, support_config)
            if kinds:
                support_map[str(node_no)] = "+".join(kinds)
    return specs_by_node, support_map


def _merge_specs(left: tuple[base.RestraintSpec, ...], right: tuple[base.RestraintSpec, ...]) -> tuple[base.RestraintSpec, ...]:
    out: list[base.RestraintSpec] = []
    seen: set[int] = set()
    for spec in list(left) + list(right):
        code = int(round(spec.type_code))
        if code not in seen:
            seen.add(code)
            out.append(spec)
        if len(out) >= base.RESTRAINT_SLOTS_PER_AUX:
            break
    return tuple(out)


def _prefer_xml_specs(
    xml_specs: dict[int, tuple[base.RestraintSpec, ...]],
    *fallback_maps: dict[int, tuple[base.RestraintSpec, ...]],
) -> dict[int, tuple[base.RestraintSpec, ...]]:
    out = dict(xml_specs)
    for spec_map in fallback_maps:
        for node_number, specs in spec_map.items():
            if node_number not in out or not out[node_number]:
                out[node_number] = specs
    return out


def _node_name_kind_map(document: base.XmlDocument, node_number_kind_map: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for branch in document.branches:
        for node in branch.nodes:
            kind = node_number_kind_map.get(str(node.node_number))
            if kind and _safe_text(node.node_name):
                out[_safe_text(node.node_name)] = kind
    return out


def _branch_case_maps(document: base.XmlDocument) -> tuple[dict[str, tuple[float, ...]], dict[str, tuple[float, ...]]]:
    return ({b.branch_name: tuple(b.temperatures) for b in document.branches}, {b.branch_name: tuple(b.pressures) for b in document.branches})


def _case_values(values: tuple[float, ...], size: int) -> list[float]:
    out = list(values[:size])
    while len(out) < size:
        out.append(0.0)
    return [0.0 if abs(v - SENTINEL_TEMPERATURE) < 1e-9 else v for v in out]


def _direction_for_spec(spec: base.RestraintSpec) -> tuple[float, float, float]:
    if getattr(spec, 'direction_cosines', None) is not None:
        return spec.direction_cosines
    return base._direction_cosines_for_restraint_type(spec.type_code, spec.is_open_end)


def _patched_build_restraint_payload_factory(support_config: dict[str, Any]):
    def _patched_build_restraint_payload(model: base.ConversionModel, cfg: dict[str, Any] | None = None) -> list[str]:
        actual_config = support_config if cfg is None else cfg
        lines: list[str] = []
        for assigned in model.restraints:
            for slot_index in range(base.RESTRAINT_SLOTS_PER_AUX):
                if slot_index < len(assigned.specs):
                    spec = assigned.specs[slot_index]
                    secondary_flag = base._format_fixed_float(0.0, 6) if spec.is_open_end else base._format_fixed_float(1.0, 5)
                    cx, cy, cz = _direction_for_spec(spec)
                    fric_val = _cii_friction_value(spec.friction, actual_config)
                    line1 = base._row([
                        base._format_auto_float(float(assigned.node_number)),
                        base._format_auto_float(float(spec.type_code)),
                        base._format_auto_float(spec.stiffness),
                        base._format_fixed_float(spec.gap, 6),
                        base._format_fixed_float(fric_val, 6),
                        base._format_fixed_float(0.0, 6),
                    ])
                    raw_tag = assigned.kind if slot_index == 0 else ""
                else:
                    secondary_flag = base._format_fixed_float(0.0, 6)
                    cx, cy, cz = 0.0, 0.0, 0.0
                    line1 = base._row([
                        base._format_fixed_float(0.0, 6),
                        base._format_fixed_float(0.0, 6),
                        base._format_auto_float(base.DEFAULT_LINEAR_STIFFNESS),
                        base._format_fixed_float(0.0, 6),
                        base._format_fixed_float(0.0, 6),
                        base._format_fixed_float(0.0, 6),
                    ])
                    raw_tag = ""
                cz_decimals = 6 if abs(cz) < 1e-9 else 5
                line2 = base._row([
                    base._format_fixed_float(cx, 6),
                    base._format_fixed_float(cy, 6),
                    base._format_fixed_float(cz, cz_decimals),
                ])
                support_tag = base._support_tag_for_cii_aux(raw_tag, actual_config)
                support_guid = base._support_guid_for_cii_aux(getattr(assigned, "support_guid", ""), actual_config)
                tag_line = base._cii_aux_string_record(support_tag)
                guid_line = base._cii_aux_string_record(support_guid)
                lines.extend([line1, line2, tag_line, guid_line])
        return lines
    return _patched_build_restraint_payload


def _patched_elements_payload_factory(temperature_map: dict[str, tuple[float, ...]], pressure_map: dict[str, tuple[float, ...]], insulation_density_map: dict[str, float], hydro_pressure_map: dict[str, float] | None = None, support_config: dict[str, Any] | None = None):
    if support_config is None:
        support_config = {}
    def _build_elements_payload(model: base.ConversionModel) -> list[str]:
        lines: list[str] = []
        zero6 = base._row([base._format_fixed_float(0.0, 6)] * 6)
        for edge_index, edge in enumerate(model.edges):
            mapped_from = base._map_position_to_cii(edge.from_node.position)
            mapped_to = base._map_position_to_cii(edge.to_node.position)
            dx, dy, dz = (mapped_to[i] - mapped_from[i] for i in range(3))
            temps = _case_values(temperature_map.get(edge.branch_name, (edge.branch_temperature,)), 9)
            pressures = _case_values(pressure_map.get(edge.branch_name, (edge.branch_pressure,)), 9)
            insulation_density = _density_for_output(insulation_density_map.get(edge.branch_name, 0.0), support_config)
            fluid_density = _density_for_output(edge.branch_fluid_density, support_config)
            hydro_pressure = (hydro_pressure_map or {}).get(edge.branch_name, 0.0)
            lines.extend([
                base._row([base._format_auto_float(float(edge.from_node.node_number)), base._format_auto_float(float(edge.to_node.node_number)), base._format_auto_float(dx), base._format_auto_float(dy), base._format_auto_float(dz), base._format_auto_float(base._element_outside_diameter(edge))]),
                base._row(["1.000000E-02" if edge.from_node.wall_thickness <= 0.0 else base._format_auto_float(edge.from_node.wall_thickness), base._format_auto_float(edge.to_node.insulation_thickness), base._format_auto_float(edge.to_node.corrosion_allowance), base._format_auto_float(temps[0]), base._format_auto_float(temps[1]), base._format_auto_float(temps[2])]),
                base._row([base._format_auto_float(v) for v in temps[3:9]]),
                base._row([base._format_auto_float(v) for v in pressures[0:6]]),
                base._row([base._format_auto_float(pressures[6]), base._format_auto_float(pressures[7]), base._format_auto_float(pressures[8]), base._format_fixed_float(0.0, 6), base._format_fixed_float(0.0, 6), base._format_fixed_float(0.0, 6)]),
                base._row([base._format_auto_float(insulation_density), base._format_auto_float(fluid_density), base._format_fixed_float(0.0, 6), base._format_fixed_float(0.0, 6), base._format_fixed_float(0.0, 6), base._format_auto_float(hydro_pressure)]),
                zero6, zero6,
                base._row([base._format_fixed_float(0.0, 6)] * 5),
                base.ELEMENT_BLOCK_LONG_ZERO_LINE,
                base._element_line_number_field(edge.branch_name),
                base.ELEMENT_BLOCK_NODE_REF_LINE,
                base._row([str(model.edge_to_bend_index.get(edge_index, 0)), str(model.edge_to_rigid_index.get(edge_index, 0)), "0", str(model.edge_to_restraint_index.get(edge_index, 0)), "0", "0"]),
                base._row(["0", "0", "0", "0", str(model.edge_to_sif_index.get(edge_index, 0)), str(model.edge_to_nodename_index.get(edge_index, 0))]),
                base._row([str(model.edge_to_reducer_index.get(edge_index, 0)), "0", "0"]),
            ])
        return lines
    return _build_elements_payload


def _maybe_enrich_from_staged_json(input_xml: Path, staged_json: Path | None, support_config: dict[str, Any]) -> Path:
    if staged_json is None:
        return input_xml
    if _xml_has_dtxr_annotations(input_xml):
        support_config["_inputAlreadyEnriched"] = True
        return input_xml
    if addon is None:
        raise ValueError("--staged-json requires xml_to_cii2019_master_addon.py to be available.")
    result = addon.enrich_xml_addons(input_xml, linelist=None, overrides=None, staged_json=staged_json.read_text(encoding="utf-8-sig"), dtxr_position_offset=support_config.get("dtxrPositionOffset") if isinstance(support_config, dict) else None)
    temp_path = Path(tempfile.gettempdir()) / f"{input_xml.stem}_dtxr_enriched.xml"
    temp_path.write_text(result["xmlText"], encoding="utf-8")
    support_config["_generatedDtxrEnrichment"] = True
    return temp_path


def _xml_has_dtxr_annotations(xml_path: Path) -> bool:
    root = ET.parse(xml_path).getroot()
    namespace = _namespace(root.tag)
    for node in root.iter():
        if _local_name(node.tag) != "Node":
            continue
        if _child_text(node, namespace, "DTXR_POS") or _child_text(node, namespace, "DTXR_PS"):
            return True
    return False


def _xml_restraints_are_authoritative(xml_path: Path, support_config: dict[str, Any]) -> bool:
    return bool(support_config.get("_inputAlreadyEnriched")) or (
        _xml_has_dtxr_annotations(xml_path) and not bool(support_config.get("_generatedDtxrEnrichment"))
    )


def _build_conversion_model(
    document: base.XmlDocument,
    explicit_specs: dict[int, tuple[base.RestraintSpec, ...]],
    support_map: dict[str, str] | None,
    support_config: dict[str, Any] | None = None,
) -> base.ConversionModel:
    edges = base._build_edges(document.branches)
    degrees = base._build_degree_map(edges)
    nodename_lines, edge_to_nodename_index = base._build_nodename_lines(edges, support_config)
    bend_edges, edge_to_bend_index = base._build_bend_indices(edges)
    rigid_edges, edge_to_rigid_index = base._build_rigid_indices(edges)
    rigid_mass_source_nodes_by_branch: dict[str, list[base.XmlNode]] = {}
    for branch in document.branches:
        rigid_mass_source_nodes_by_branch.setdefault(branch.branch_name, []).extend(
            branch.mass_source_nodes or branch.nodes
        )
    rigid_mass_assignments = base.resolve_element_rigid_masses(
        edges, edge_to_rigid_index,
        mass_source_nodes_by_branch=rigid_mass_source_nodes_by_branch,
    )
    sif_edges, edge_to_sif_index = base._build_sif_indices(edges)
    reducer_edges, edge_to_reducer_index = base._build_reducer_indices(edges)
    restraints, edge_to_restraint_index = base._build_restraints(document.metadata, edges, degrees, explicit_specs, support_map)
    return base.ConversionModel(
        document.metadata,
        edges,
        degrees,
        nodename_lines,
        edge_to_nodename_index,
        bend_edges,
        edge_to_bend_index,
        rigid_edges,
        edge_to_rigid_index,
        sif_edges,
        edge_to_sif_index,
        reducer_edges,
        edge_to_reducer_index,
        restraints,
        edge_to_restraint_index,
        rigid_mass_assignments=rigid_mass_assignments,
        rigid_mass_source_nodes_by_branch=rigid_mass_source_nodes_by_branch,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Patched PSI116 XML to CII(2019) converter.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--template-cii", required=False, type=Path, default=None)
    parser.add_argument("--coords-mode", required=False, default="first", choices=["first", "all", "none"])
    parser.add_argument("--weight-scale", required=False, type=float, default=1.0)
    parser.add_argument("--support-config-json", required=False, default="")
    parser.add_argument("--staged-json", required=False, type=Path, default=None)
    parser.add_argument("--diagnostics-out", required=False, type=Path, default=None)
    parser.add_argument("--use-restraint-type-based-on-json", dest="use_restraint_type_based_on_json", action="store_true", default=True)
    parser.add_argument("--no-use-restraint-type-based-on-json", dest="use_restraint_type_based_on_json", action="store_false")
    parser.add_argument("--split-condensed-valve-flange", dest="split_condensed_valve_flange", action="store_true", default=None)
    parser.add_argument("--no-split-condensed-valve-flange", dest="split_condensed_valve_flange", action="store_false")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    support_config = _load_support_config(args.support_config_json)
    if args.split_condensed_valve_flange is not None:
        support_config["splitCondensedValveFlange"] = bool(args.split_condensed_valve_flange)
    input_xml = _maybe_enrich_from_staged_json(args.input, args.staged_json, support_config)
    input_xml = _apply_process_data_to_xml(input_xml, support_config)
    insulation_density_map = _branch_insulation_density_map(input_xml)
    hydro_pressure_map = _branch_hydro_pressure_map(input_xml)
    document = base._parse_xml_document(input_xml)
    dtxr_specs, node_number_kind_map = _build_keyword_restraint_specs(input_xml, support_config)
    xml_specs = base._build_explicit_restraint_specs(document.branches)
    explicit_specs = dict(xml_specs) if _xml_restraints_are_authoritative(input_xml, support_config) else _prefer_xml_specs(xml_specs, dtxr_specs)
    model = _build_conversion_model(document, explicit_specs, _node_name_kind_map(document, node_number_kind_map), support_config)
    temperature_map, pressure_map = _branch_case_maps(document)
    base._build_restraint_payload = _patched_build_restraint_payload_factory(support_config)
    base._build_elements_payload = _patched_elements_payload_factory(temperature_map, pressure_map, insulation_density_map, hydro_pressure_map, support_config)  # type: ignore[assignment]
    cii_text = base._build_cii_text(model, args.coords_mode, base._resolve_template_version_line(args.template_cii), args.weight_scale)
    args.output.write_text(cii_text, encoding="utf-8")
    if args.diagnostics_out:
        args.diagnostics_out.write_text(base._build_diagnostics_report(model), encoding="utf-8")
    print(f"Wrote {args.output} with {len(model.edges)} elements and {len(model.restraints)} restraints. use_restraint_type_based_on_json={args.use_restraint_type_based_on_json}; split_condensed_valve_flange={support_config.get('splitCondensedValveFlange')}")


if __name__ == "__main__":
    main()
