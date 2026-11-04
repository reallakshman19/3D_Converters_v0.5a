"""Read-only, byte-reconciled RIGID edge ledger for the actual Python CII output.

This records *all* emitted RIGID auxiliaries, including zero weights. It is
not a physical-ownership approval and never changes an engineering mass.
"""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

import xml_to_cii2019 as base


def _rigid_aux_lines(cii_text: str) -> list[str]:
    lines = cii_text.splitlines()
    try:
        first = lines.index("#$ RIGID") + 1
    except ValueError as exc:
        raise ValueError("CII has no RIGID section; edge ownership cannot be reconciled.") from exc
    result = []
    for line in lines[first:]:
        if line.startswith("#$ "):
            break
        if line.strip():
            result.append(line)
    return result


def _weight_state(raw: str, parsed: float) -> str:
    if not raw.strip():
        return "MISSING"
    try:
        numeric = float(raw.replace(",", ""))
    except ValueError:
        return "INVALID"
    if not math.isfinite(numeric):
        return "INVALID"
    if numeric < 0:
        return "NEGATIVE"
    if numeric == 0:
        return "ZERO"
    if not math.isclose(numeric, parsed, rel_tol=1e-12, abs_tol=1e-9):
        return "SOURCE_PARSE_MISMATCH"
    return "POSITIVE"


def build_rigid_emission_ledger(
    model: base.ConversionModel,
    cii_text: str,
    weight_scale: float,
    prepared_xml: Path | None = None,
) -> dict[str, Any]:
    """Reconcile RIGID index, actual CII auxiliary, and Python owner-node mass."""
    if not math.isfinite(weight_scale) or weight_scale <= 0:
        raise ValueError("RIGID weight scale must be finite and positive.")
    records = _rigid_aux_lines(cii_text)
    if len(records) != len(model.rigid_edges):
        raise ValueError(
            "CII RIGID auxiliary count does not match Python conversion model: "
            f"{len(records)} emitted versus {len(model.rigid_edges)} expected."
        )
    rows: list[dict[str, Any]] = []
    seen_indexes: set[int] = set()
    for edge_index, edge in enumerate(model.edges):
        rigid_index = model.edge_to_rigid_index.get(edge_index)
        if rigid_index is None:
            continue
        if rigid_index < 1 or rigid_index > len(records) or rigid_index in seen_indexes:
            raise ValueError(f"Invalid or repeated RIGID auxiliary reference {rigid_index}.")
        seen_indexes.add(rigid_index)
        values = records[rigid_index - 1].split()
        if not values:
            raise ValueError(f"Empty CII RIGID auxiliary {rigid_index}.")
        try:
            emitted_weight = float(values[0])
        except ValueError as exc:
            raise ValueError(f"Invalid emitted CII RIGID mass at auxiliary {rigid_index}.") from exc
        mass_kg = base._rigid_weight_for_edge(edge)
        expected_value = float(base._format_auto_float(mass_kg * weight_scale))
        if not math.isfinite(emitted_weight) or not math.isclose(
            emitted_weight, expected_value, rel_tol=1e-12, abs_tol=1e-9
        ):
            raise ValueError(
                f"CII RIGID auxiliary {rigid_index} differs from Python owner: "
                f"emitted {emitted_weight}, expected {expected_value}."
            )
        owner = edge.to_node
        from_node = edge.from_node
        length_mm = math.dist(from_node.position, owner.position)
        rows.append({
            "edgeIndex": edge_index + 1,
            "rigidAuxIndex": rigid_index,
            "branchName": edge.branch_name,
            "branchOccurrence": owner.source_branch_ordinal,
            "fromNode": from_node.node_number,
            "toNode": owner.node_number,
            "fromNodeOccurrence": from_node.source_node_ordinal,
            "toNodeOccurrence": owner.source_node_ordinal,
            "fromPosition": list(from_node.position),
            "toPosition": list(owner.position),
            "elementLengthMm": length_mm,
            "fromComponentType": from_node.component_type,
            "toComponentType": owner.component_type,
            "toEndpoint": owner.endpoint,
            "componentRefNo": owner.component_ref_no,
            "rigidFlag": owner.rigid,
            "ownerConvention": "TO_NODE_WEIGHT",
            "rawOwnerWeight": owner.source_weight_raw,
            "weightState": _weight_state(owner.source_weight_raw, mass_kg),
            "massKg": mass_kg,
            "expectedCiiMass": expected_value,
            "emittedCiiMass": emitted_weight,
        })
    if len(seen_indexes) != len(records):
        raise ValueError("One or more emitted CII RIGID auxiliary records have no Python edge.")
    rows.sort(key=lambda row: row["rigidAuxIndex"])
    result = {
        "schema": "xml-cii-rigid-python-emission-ledger/v1",
        "authority": "ACTUAL_PYTHON_MODEL_AND_EMITTED_CII",
        "weightScale": weight_scale,
        "emittedUnit": "N" if weight_scale == 10 else "scaled-CII-weight",
        "preparedXmlSha256": hashlib.sha256(prepared_xml.read_bytes()).hexdigest() if prepared_xml else None,
        "ciiSha256": hashlib.sha256(cii_text.encode("utf-8")).hexdigest(),
        "summary": {
            "rigidAuxCount": len(rows),
            "positiveCount": sum(row["weightState"] == "POSITIVE" for row in rows),
            "zeroCount": sum(row["weightState"] == "ZERO" for row in rows),
            "missingCount": sum(row["weightState"] == "MISSING" for row in rows),
            "invalidCount": sum(row["weightState"] in ("INVALID", "SOURCE_PARSE_MISMATCH", "NEGATIVE") for row in rows),
            "totalMassKg": sum(row["massKg"] for row in rows),
            "totalEmittedCiiMass": sum(row["emittedCiiMass"] for row in rows),
        },
        "rows": rows,
    }
    return result
