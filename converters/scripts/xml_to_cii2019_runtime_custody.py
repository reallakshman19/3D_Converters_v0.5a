#!/usr/bin/env python3
"""Runtime custody wrapper for standalone PSI116 XML -> CII 2019.

Adds two narrow mechanics on top of xml_to_cii2019_direction:
1. Synthetic RestrainOpenEnds ANC restraints are allowed only at true physical
   open ends. A degree-1 engineering node coincident with another retained node
   number is a branch/continuation occurrence and is not auto-anchored.
2. Bend-radius field authority follows the app toggle. OFF writes zero in the
   CII BEND radius slot; ON writes 1.5 * OD.
"""
from __future__ import annotations

from collections import Counter
import math
import json
import sys

import xml_to_cii2019 as base
import xml_to_cii2019_patched as patched
import xml_to_cii2019_direction as direction
from xml_to_cii2019_bend_radius_policy import apply_bend_radius_policy, publish_one_point_five_d
from xml_to_cii2019_rigid_ledger import build_rigid_emission_ledger


OPEN_END_COINCIDENT_TOLERANCE_MM = 0.5
_ORIGINAL_BUILD_RESTRAINTS = base._build_restraints
_PUBLISH_BEND_RADIUS_1_5D = False


def _distance(left, right) -> float:
    return math.sqrt(sum((float(left[i]) - float(right[i])) ** 2 for i in range(3)))


def _unique_edge_nodes(edges: list[base.Edge]) -> list[base.XmlNode]:
    seen: set[tuple[int, tuple[float, float, float]]] = set()
    out: list[base.XmlNode] = []
    for edge in edges:
        for node in (edge.from_node, edge.to_node):
            key = (int(node.node_number), tuple(float(value) for value in node.position))
            if key in seen:
                continue
            seen.add(key)
            out.append(node)
    return out


def _coincident_aliases(edges: list[base.Edge], tolerance_mm: float = OPEN_END_COINCIDENT_TOLERANCE_MM) -> dict[int, set[int]]:
    nodes = _unique_edge_nodes(edges)
    aliases: dict[int, set[int]] = {}
    for index, left in enumerate(nodes):
        for right in nodes[index + 1:]:
            if left.node_number == right.node_number:
                continue
            if _distance(left.position, right.position) > tolerance_mm:
                continue
            aliases.setdefault(int(left.node_number), set()).add(int(right.node_number))
            aliases.setdefault(int(right.node_number), set()).add(int(left.node_number))
    return aliases


def topology_aware_open_end_degrees(
    edges: list[base.Edge],
    degrees: Counter[int],
    tolerance_mm: float = OPEN_END_COINCIDENT_TOLERANCE_MM,
) -> tuple[Counter[int], list[dict]]:
    adjusted: Counter[int] = Counter(degrees)
    aliases = _coincident_aliases(edges, tolerance_mm)
    suppressed: list[dict] = []
    for node_number, degree in list(degrees.items()):
        if degree != 1:
            continue
        peers = sorted(aliases.get(int(node_number), set()))
        if not peers:
            continue
        adjusted[node_number] = 2
        suppressed.append({
            "nodeNumber": int(node_number),
            "engineeringDegree": int(degree),
            "coincidentNodeNumbers": peers,
            "toleranceMm": tolerance_mm,
            "reason": "coincident-retained-occurrence-is-not-physical-open-end",
        })
    return adjusted, suppressed


def _topology_aware_build_restraints(
    metadata: base.XmlMetadata,
    edges: list[base.Edge],
    degrees: Counter[int],
    explicit_specs: dict[int, tuple[base.RestraintSpec, ...]],
    support_map: dict | None = None,
):
    adjusted, suppressed = topology_aware_open_end_degrees(edges, degrees)
    if metadata.restrain_open_ends:
        for row in suppressed:
            print(
                "OPEN_END_ANC_SUPPRESSED "
                f"node={row['nodeNumber']} peers={','.join(map(str, row['coincidentNodeNumbers']))} "
                f"tol_mm={row['toleranceMm']}",
                file=sys.stderr,
            )
    restraints, edge_to_index = _ORIGINAL_BUILD_RESTRAINTS(metadata, edges, adjusted, explicit_specs, support_map)
    if metadata.restrain_open_ends:
        for assigned in restraints:
            if not any(getattr(spec, "is_open_end", False) for spec in assigned.specs):
                continue
            print(
                "OPEN_END_ANC_CREATED "
                f"node={assigned.node_number} basis=true-physical-open-end "
                f"stiffness={base.OPEN_END_STIFFNESS:.6E}",
                file=sys.stderr,
            )
    return restraints, edge_to_index


def _runtime_bend_payload(model: base.ConversionModel) -> list[str]:
    lines: list[str] = []
    for edge in model.bend_edges:
        bend_type_value = 0.0 if edge.to_node.bend_type is None else float(edge.to_node.bend_type)
        radius = 1.5 * base._element_outside_diameter(edge) if _PUBLISH_BEND_RADIUS_1_5D else 0.0
        line1 = base._row([
            base._format_auto_float(radius),
            base._format_auto_float(bend_type_value),
            base._format_fixed_float(base.BEND_FLEXIBILITY_CONSTANT, 5),
            base._format_auto_float(float(edge.to_node.node_number - 1)),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
        ])
        line2 = base._row([
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
        ])
        line3 = base._row([
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
        ])
        lines.extend([line1, line2, line3])
    return lines


def install_runtime_custody_patch() -> None:
    # direction imported above has already installed its direction-cosine and
    # tolerant-restraint patches. Wrap that active implementation rather than
    # reverting to the older base builder.
    base._build_restraints = _topology_aware_build_restraints  # type: ignore[assignment]
    base._build_bend_payload = _runtime_bend_payload  # type: ignore[assignment]


def main() -> None:
    global _PUBLISH_BEND_RADIUS_1_5D

    args = patched._parse_args()
    support_config = patched._load_support_config(args.support_config_json)
    if args.split_condensed_valve_flange is not None:
        support_config["splitCondensedValveFlange"] = bool(args.split_condensed_valve_flange)
    support_config.setdefault("teeSifTypeMapping", direction.DEFAULT_TEE_SIF_TYPE_MAPPING)
    support_config.setdefault("defaultTeeSifType", 0)
    _PUBLISH_BEND_RADIUS_1_5D = publish_one_point_five_d(support_config)

    input_xml = patched._maybe_enrich_from_staged_json(args.input, args.staged_json, support_config)
    input_xml = patched._apply_process_data_to_xml(input_xml, support_config)
    input_xml, bend_policy = apply_bend_radius_policy(input_xml, support_config)
    for row in bend_policy.get("rows", []):
        print(
            "BEND_RADIUS_POLICY "
            f"node={row.get('nodeNumber','')} action={row.get('action','')} "
            f"basis={row.get('basis', row.get('outsideDiameterSource',''))} "
            f"radius={row.get('bendRadius','')}",
            file=sys.stderr,
        )

    tee_desc_by_node = direction._tee_description_by_node(input_xml)
    insulation_density_map = patched._branch_insulation_density_map(input_xml)
    hydro_pressure_map = patched._branch_hydro_pressure_map(input_xml)
    document = base._parse_xml_document(input_xml)
    component_specs = direction._component_type_restraint_specs(document, support_config)
    dtxr_specs, node_number_kind_map = patched._build_keyword_restraint_specs(input_xml, support_config)
    xml_specs = base._build_explicit_restraint_specs(document.branches)
    explicit_specs = (
        dict(xml_specs)
        if args.use_restraint_type_based_on_json and patched._xml_restraints_are_authoritative(input_xml, support_config)
        else (
            direction._prefer_xml_spec_map(xml_specs, component_specs, dtxr_specs)
            if args.use_restraint_type_based_on_json
            else direction._merge_spec_maps(component_specs, xml_specs, dtxr_specs)
        )
    )
    model = patched._build_conversion_model(
        document,
        explicit_specs,
        patched._node_name_kind_map(document, node_number_kind_map),
        support_config,
    )
    temperature_map, pressure_map = patched._branch_case_maps(document)
    base._build_restraint_payload = direction._direction_enabled_restraint_payload_factory(support_config)
    base._build_elements_payload = patched._patched_elements_payload_factory(
        temperature_map,
        pressure_map,
        insulation_density_map,
        hydro_pressure_map,
        support_config,
    )  # type: ignore[assignment]
    base._build_sif_payload = direction._sif_payload_factory(tee_desc_by_node, support_config)  # type: ignore[assignment]
    cii_text = base._build_cii_text(
        model,
        args.coords_mode,
        base._resolve_template_version_line(args.template_cii),
        args.weight_scale,
        support_config,
    )
    # Validate every RIGID auxiliary against the exact CII bytes before
    # releasing either output. A separate manifest is always emitted.
    rigid_ledger = build_rigid_emission_ledger(model, cii_text, args.weight_scale, input_xml)
    rigid_ledger_path = args.output.with_suffix(".rigid_ledger.json")
    args.output.write_text(cii_text, encoding="utf-8")
    rigid_ledger_path.write_text(json.dumps(rigid_ledger, indent=2), encoding="utf-8")
    if args.diagnostics_out:
        args.diagnostics_out.write_text(base._build_diagnostics_report(model), encoding="utf-8")
    print(
        f"Wrote {args.output} with {len(model.edges)} elements and {len(model.restraints)} restraints. "
        f"rigid_ledger={rigid_ledger_path}; runtime_custody=1; bend_radius_1_5d={_PUBLISH_BEND_RADIUS_1_5D}; "
        f"use_restraint_type_based_on_json={args.use_restraint_type_based_on_json}; "
        f"split_condensed_valve_flange={support_config.get('splitCondensedValveFlange')}"
    )


install_runtime_custody_patch()


if __name__ == "__main__":
    main()
