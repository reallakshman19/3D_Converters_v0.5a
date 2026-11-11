#!/usr/bin/env python3
"""XML -> CII(2019) wrapper with PSI116 component-topology reconstruction.

The legacy converter builds CII edges from positive NodeNumber rows in branch
order. PSI116 is richer: one physical component may be represented by several
Node records sharing ComponentRefNo, including negative helper ports. This
wrapper inventories those full records before the base parser filters them,
then uses component occurrences to own BEND/SIF/REDUCERS auxiliaries, preserve
special fittings during short-span contraction, and canonicalize unique
coincident cross-branch node identities before CII elements are created.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import xml_to_cii2019 as base
import xml_to_cii2019_direction as direction


SPECIAL_COMPONENT_TYPES = frozenset({"ELBO", "TEE", "OLET", "REDU", "BRAN"})
BRANCH_LINK_TOLERANCE_MM = 0.5


@dataclass(frozen=True)
class SourceNodeRecord:
    branch_index: int
    branch_name: str
    source_index: int
    node_number: int | None
    node_name: str
    endpoint: int | None
    component_type: str
    component_ref_no: str
    connection_type: str
    position: tuple[float, float, float] | None
    bend_radius: float
    bend_type: int | None
    alpha_angle: float | None


@dataclass(frozen=True)
class ComponentOccurrence:
    occurrence_id: str
    branch_index: int
    branch_name: str
    component_ref_no: str
    semantic_type: str
    records: tuple[SourceNodeRecord, ...]

    @property
    def positive_node_numbers(self) -> tuple[int, ...]:
        return tuple(
            record.node_number
            for record in self.records
            if record.node_number is not None and record.node_number > 0
        )


@dataclass
class ComponentTopologyContext:
    source_path: str = ""
    records: list[SourceNodeRecord] = field(default_factory=list)
    occurrences: list[ComponentOccurrence] = field(default_factory=list)
    occurrences_by_node: dict[int, list[ComponentOccurrence]] = field(default_factory=lambda: defaultdict(list))
    topology_links: set[tuple[int, int]] = field(default_factory=set)
    node_aliases: dict[int, int] = field(default_factory=dict)
    diagnostics: list[dict[str, object]] = field(default_factory=list)
    diagnostic_keys: set[tuple[object, ...]] = field(default_factory=set)
    reducer_occurrences_by_branch: dict[str, list[ComponentOccurrence]] = field(default_factory=lambda: defaultdict(list))
    reducer_helper_nodes: dict[tuple[str, int], int] = field(default_factory=dict)

    def record_once(self, key: tuple[object, ...], code: str, message: str, **context: object) -> None:
        if key in self.diagnostic_keys:
            return
        self.diagnostic_keys.add(key)
        self.diagnostics.append({"code": code, "message": message, **context})


_ACTIVE_TOPOLOGY = ComponentTopologyContext()
_ORIGINAL_PARSE_XML_DOCUMENT = base._parse_xml_document
_ORIGINAL_BUILD_RESTRAINTS = base._build_restraints
_ORIGINAL_DIAGNOSTICS_REPORT = base._build_diagnostics_report


def _distance(left: base.XmlNode, right: base.XmlNode) -> float:
    return math.sqrt(
        (right.position[0] - left.position[0]) ** 2
        + (right.position[1] - left.position[1]) ** 2
        + (right.position[2] - left.position[2]) ** 2
    )


def _source_position(text: str) -> tuple[float, float, float] | None:
    parts = base._safe_text(text).split()
    if len(parts) != 3:
        return None
    try:
        values = tuple(float(part) for part in parts)
    except ValueError:
        return None
    return values if all(math.isfinite(value) for value in values) else None


def _source_float(parent: ET.Element, namespace: str, name: str, default: float = 0.0) -> float:
    value = base._parse_optional_float(base._child_text(parent, namespace, name), f"Node/{name}")
    return default if value is None else value


def _semantic_type(component_type: str, connection_type: str = "") -> str:
    component = base._safe_text(component_type).upper()
    connection = base._safe_text(connection_type).upper()
    if component in {"ELBO", "BEND"}:
        return "ELBO"
    if component == "BRAN" and connection == "TEE":
        return "TEE"
    if component in {"TEE", "OLET", "REDU"}:
        return component
    return component or "UNKNOWN"


def _source_records(path: Path) -> list[SourceNodeRecord]:
    root = ET.parse(path).getroot()
    namespace = base._namespace(root.tag)
    records: list[SourceNodeRecord] = []
    branch_index = 0
    for branch in root.iter():
        if base._local_name(branch.tag) != "Branch":
            continue
        branch_index += 1
        branch_name = base._child_text(branch, namespace, "Branchname")
        for source_index, node in enumerate(branch.findall(base._q(namespace, "Node")), start=1):
            records.append(
                SourceNodeRecord(
                    branch_index=branch_index,
                    branch_name=branch_name,
                    source_index=source_index,
                    node_number=base._parse_optional_int(
                        base._child_text(node, namespace, "NodeNumber"), "Node/NodeNumber"
                    ),
                    node_name=base._child_text(node, namespace, "NodeName"),
                    endpoint=base._parse_optional_int(
                        base._child_text(node, namespace, "Endpoint"), "Node/Endpoint"
                    ),
                    component_type=base._child_text(node, namespace, "ComponentType").upper(),
                    component_ref_no=base._child_text(node, namespace, "ComponentRefNo"),
                    connection_type=base._child_text(node, namespace, "ConnectionType").upper(),
                    position=_source_position(base._child_text(node, namespace, "Position")),
                    bend_radius=_source_float(node, namespace, "BendRadius"),
                    bend_type=base._parse_optional_int(
                        base._child_text(node, namespace, "BendType"), "Node/BendType"
                    ),
                    alpha_angle=base._parse_optional_float(
                        base._child_text(node, namespace, "AlphaAngle"), "Node/AlphaAngle"
                    ),
                )
            )
    return records


def _occurrences(records: list[SourceNodeRecord]) -> list[ComponentOccurrence]:
    out: list[ComponentOccurrence] = []
    by_branch: dict[int, list[SourceNodeRecord]] = defaultdict(list)
    for record in records:
        by_branch[record.branch_index].append(record)
    for branch_index, rows in by_branch.items():
        current: list[SourceNodeRecord] = []
        current_key: tuple[str, str] | None = None

        def flush() -> None:
            nonlocal current, current_key
            if not current:
                return
            semantic_types = [_semantic_type(row.component_type, row.connection_type) for row in current]
            semantic = next((value for value in semantic_types if value in SPECIAL_COMPONENT_TYPES), semantic_types[0])
            first = current[0]
            ref = first.component_ref_no
            occurrence_id = f"B{branch_index}:{ref or 'anonymous'}:{first.source_index}"
            out.append(
                ComponentOccurrence(
                    occurrence_id=occurrence_id,
                    branch_index=branch_index,
                    branch_name=first.branch_name,
                    component_ref_no=ref,
                    semantic_type=semantic,
                    records=tuple(current),
                )
            )
            current = []
            current_key = None

        for row in rows:
            semantic = _semantic_type(row.component_type, row.connection_type)
            key = (row.component_ref_no, semantic) if row.component_ref_no else (f"@{row.source_index}", semantic)
            if current_key is not None and key != current_key:
                flush()
            current_key = key
            current.append(row)
        flush()
    return out


def _activate_component_topology(path: Path) -> None:
    global _ACTIVE_TOPOLOGY
    context = ComponentTopologyContext(source_path=str(path))
    context.records = _source_records(path)
    context.occurrences = _occurrences(context.records)
    for occurrence in context.occurrences:
        if occurrence.semantic_type == "REDU":
            context.reducer_occurrences_by_branch[occurrence.branch_name].append(occurrence)
    for occurrence in context.occurrences:
        for node_number in occurrence.positive_node_numbers:
            context.occurrences_by_node[node_number].append(occurrence)
    _ACTIVE_TOPOLOGY = context


def _canonical_node_number(node_number: int) -> int:
    current = node_number
    seen: set[int] = set()
    while current in _ACTIVE_TOPOLOGY.node_aliases and current not in seen:
        seen.add(current)
        current = _ACTIVE_TOPOLOGY.node_aliases[current]
    return current


def _source_numbers_for_canonical(node_number: int) -> set[int]:
    canonical = _canonical_node_number(node_number)
    sources = {canonical}
    for source in _ACTIVE_TOPOLOGY.occurrences_by_node:
        if _canonical_node_number(source) == canonical:
            sources.add(source)
    return sources


def _occurrence_for_node(node_number: int, branch_name: str = "") -> ComponentOccurrence | None:
    candidates: list[ComponentOccurrence] = []
    seen: set[str] = set()
    for source_number in _source_numbers_for_canonical(node_number):
        for occurrence in _ACTIVE_TOPOLOGY.occurrences_by_node.get(source_number, []):
            if occurrence.occurrence_id in seen:
                continue
            seen.add(occurrence.occurrence_id)
            candidates.append(occurrence)
    if branch_name:
        exact = [item for item in candidates if item.branch_name == branch_name]
        if len(exact) == 1:
            return exact[0]
    return candidates[0] if len(candidates) == 1 else None


def _semantic_type_for_node(node: base.XmlNode, branch_name: str = "") -> str:
    occurrence = _occurrence_for_node(node.node_number, branch_name)
    if occurrence is not None:
        return occurrence.semantic_type
    return _semantic_type(node.component_type)


def _is_special_node(node: base.XmlNode, branch_name: str = "") -> bool:
    return _semantic_type_for_node(node, branch_name) in SPECIAL_COMPONENT_TYPES


def _position_key(position: tuple[float, float, float]) -> tuple[int, int, int]:
    return tuple(int(round(value / BRANCH_LINK_TOLERANCE_MM)) for value in position)


def _connection_priority(node: base.XmlNode, branch_name: str, role: str) -> tuple[int, int]:
    semantic = _semantic_type_for_node(node, branch_name)
    priority = {
        "ELBO": 950,
        "TEE": 900,
        "OLET": 900,
        "REDU": 850,
        "BRAN": 800,
    }.get(semantic, 100)
    if role in {"head", "tail"}:
        priority += 25
    return (priority, -node.node_number)


def _register_topology_alias(
    role: str,
    endpoint_branch: str,
    endpoint: base.XmlNode,
    candidate_branch: str,
    candidate: base.XmlNode,
) -> None:
    endpoint_priority = _connection_priority(endpoint, endpoint_branch, role)
    candidate_priority = _connection_priority(candidate, candidate_branch, "internal")
    canonical = endpoint if endpoint_priority >= candidate_priority else candidate
    absorbed = candidate if canonical is endpoint else endpoint
    canonical_number = _canonical_node_number(canonical.node_number)
    absorbed_number = _canonical_node_number(absorbed.node_number)
    if absorbed_number == canonical_number:
        return
    _ACTIVE_TOPOLOGY.node_aliases[absorbed_number] = canonical_number
    link = (
        (candidate.node_number, endpoint.node_number)
        if role == "head"
        else (endpoint.node_number, candidate.node_number)
    )
    _ACTIVE_TOPOLOGY.topology_links.add(link)
    _ACTIVE_TOPOLOGY.record_once(
        ("canonical-link", *link),
        "PSI116_BRANCH_NODE_CANONICALIZED",
        "A unique coincident cross-branch connection was canonicalized to one CII node identity.",
        endpointRole=role,
        fromBranch=candidate_branch if role == "head" else endpoint_branch,
        fromNode=link[0],
        toBranch=endpoint_branch if role == "head" else candidate_branch,
        toNode=link[1],
        canonicalNode=canonical_number,
        absorbedNode=absorbed_number,
    )


def _discover_document_topology(document: base.XmlDocument) -> None:
    all_nodes: dict[tuple[int, int, int], list[tuple[str, base.XmlNode]]] = defaultdict(list)
    endpoint_nodes: list[tuple[str, str, base.XmlNode]] = []
    for branch in document.branches:
        if not branch.nodes:
            continue
        for node in branch.nodes:
            all_nodes[_position_key(node.position)].append((branch.branch_name, node))
        endpoint_nodes.append(("head", branch.branch_name, branch.nodes[0]))
        endpoint_nodes.append(("tail", branch.branch_name, branch.nodes[-1]))

    for role, endpoint_branch, endpoint in endpoint_nodes:
        candidates = [
            (candidate_branch, candidate)
            for candidate_branch, candidate in all_nodes[_position_key(endpoint.position)]
            if candidate_branch != endpoint_branch and candidate.node_number != endpoint.node_number
        ]
        unique_candidates: dict[tuple[str, int], tuple[str, base.XmlNode]] = {
            (candidate_branch, candidate.node_number): (candidate_branch, candidate)
            for candidate_branch, candidate in candidates
        }
        candidates = list(unique_candidates.values())
        if len(candidates) != 1:
            if len(candidates) > 1 and _is_special_node(endpoint, endpoint_branch):
                _ACTIVE_TOPOLOGY.record_once(
                    ("ambiguous-link", role, endpoint_branch, endpoint.node_number),
                    "PSI116_BRANCH_LINK_AMBIGUOUS",
                    "A special branch endpoint has multiple coincident nodes in other branches; no canonical alias was applied.",
                    endpointRole=role,
                    endpointBranch=endpoint_branch,
                    endpointNode=endpoint.node_number,
                    candidateNodes=[candidate.node_number for _, candidate in candidates],
                )
            continue
        candidate_branch, candidate = candidates[0]
        if not (
            _is_special_node(endpoint, endpoint_branch)
            or _is_special_node(candidate, candidate_branch)
        ):
            continue
        _register_topology_alias(role, endpoint_branch, endpoint, candidate_branch, candidate)


def _apply_node_aliases(document: base.XmlDocument) -> base.XmlDocument:
    if not _ACTIVE_TOPOLOGY.node_aliases:
        return document
    branches: list[base.XmlBranch] = []
    for branch in document.branches:
        nodes = [
            base.replace(node, node_number=_canonical_node_number(node.node_number))
            for node in branch.nodes
        ]
        for left, right in zip(nodes, nodes[1:]):
            if left.node_number == right.node_number:
                raise ValueError(
                    f"PSI116 canonical node alias created a zero-node span in branch '{branch.branch_name}' "
                    f"at NodeNumber {left.node_number}."
                )
        branches.append(base.replace(branch, nodes=nodes))
    return base.replace(document, branches=branches)


def _parse_xml_document_with_component_topology(path: Path) -> base.XmlDocument:
    _activate_component_topology(path)
    document = _ORIGINAL_PARSE_XML_DOCUMENT(path)
    _discover_document_topology(document)
    return _apply_node_aliases(document)


def _shared_node_numbers(branches: list[base.XmlBranch]) -> set[int]:
    counts: Counter[int] = Counter()
    for branch in branches:
        for node in branch.nodes:
            counts[node.node_number] += 1
    return {node_number for node_number, count in counts.items() if count > 1}


def _node_priority(
    node: base.XmlNode,
    shared_node_numbers: set[int],
    *,
    branch_name: str,
    is_first_node: bool,
    is_last_node: bool,
) -> int:
    component = _semantic_type_for_node(node, branch_name)
    score = 0
    if node.node_number in shared_node_numbers:
        score = max(score, 1000)
    if component == "ELBO" and node.bend_radius > 0.0:
        score = max(score, 950)
    if component in {"TEE", "OLET"} and node.endpoint in {0, 1}:
        score = max(score, 900)
    if component == "REDU":
        score = max(score, 850)
    if component in {"TEE", "OLET", "BRAN"}:
        score = max(score, 800)
    if node.restraint_specs:
        score = max(score, 700)
    if base._safe_text(node.node_name):
        score = max(score, 600)
    if is_first_node or is_last_node:
        score = max(score, 500)
    if component == "RIGID" or node.rigid == 2:
        score = max(score, 400)
    return score


def _merge_nodes(representative: base.XmlNode, absorbed: base.XmlNode) -> base.XmlNode:
    return base.replace(
        representative,
        node_name=representative.node_name or absorbed.node_name,
        restraint_specs=base._merge_restraint_specs(representative.restraint_specs, absorbed.restraint_specs),
    )


def _contract_short_element_nodes(
    branches: list[base.XmlBranch],
    threshold_mm: float = base.SHORT_ELEMENT_LENGTH_DROP_THRESHOLD_MM,
) -> list[base.XmlBranch]:
    """Contract short positive-node spans while preserving component owners."""
    new_branches: list[base.XmlBranch] = []
    shared = _shared_node_numbers(branches)
    for branch in branches:
        if len(branch.nodes) < 2:
            new_branches.append(branch)
            continue
        kept: list[base.XmlNode] = [branch.nodes[0]]
        kept_original_indices: list[int] = [0]
        for index, node in enumerate(branch.nodes[1:], start=1):
            previous = kept[-1]
            length = _distance(previous, node)
            if length <= threshold_mm:
                previous_index = kept_original_indices[-1]
                previous_priority = _node_priority(
                    previous,
                    shared,
                    branch_name=branch.branch_name,
                    is_first_node=previous_index == 0,
                    is_last_node=previous_index == len(branch.nodes) - 1,
                )
                node_priority = _node_priority(
                    node,
                    shared,
                    branch_name=branch.branch_name,
                    is_first_node=index == 0,
                    is_last_node=index == len(branch.nodes) - 1,
                )
                if node_priority > previous_priority:
                    representative, absorbed = node, previous
                    kept[-1] = _merge_nodes(node, previous)
                    kept_original_indices[-1] = index
                else:
                    representative, absorbed = previous, node
                    kept[-1] = _merge_nodes(previous, node)
                base.DROPPED_SHORT_ELEMENT_NODES.append(
                    f"Branch '{branch.branch_name}' short span {previous.node_number}->{node.node_number}: "
                    f"length {length:.3f}mm <= {threshold_mm}mm; contracted into "
                    f"NodeNumber {representative.node_number} ({representative.component_type}); "
                    f"absorbed NodeNumber {absorbed.node_number} ({absorbed.component_type})"
                )
                continue
            if kept[-1].node_number == node.node_number:
                kept[-1] = _merge_nodes(kept[-1], node)
                kept_original_indices[-1] = index
                continue
            kept.append(node)
            kept_original_indices.append(index)
        new_branches.append(branch if len(kept) < 2 else base.replace(branch, nodes=kept))
    return new_branches


def _merge_spec_map(
    target: dict[int, tuple[base.RestraintSpec, ...]],
    node_number: int,
    specs: tuple[base.RestraintSpec, ...],
) -> None:
    canonical = _canonical_node_number(node_number)
    target[canonical] = base._merge_restraint_specs(target.get(canonical, tuple()), specs)


def _build_explicit_restraint_specs(
    branches: list[base.XmlBranch],
) -> dict[int, tuple[base.RestraintSpec, ...]]:
    specs: dict[int, tuple[base.RestraintSpec, ...]] = {}
    for branch in branches:
        for node in branch.nodes:
            if node.restraint_specs:
                _merge_spec_map(specs, node.node_number, node.restraint_specs)
    return specs


def _build_restraints(
    metadata: base.XmlMetadata,
    edges: list[base.Edge],
    degrees: Counter[int],
    explicit_specs: dict[int, tuple[base.RestraintSpec, ...]],
    support_map: dict | None = None,
):
    remapped: dict[int, tuple[base.RestraintSpec, ...]] = {}
    for node_number, specs in explicit_specs.items():
        _merge_spec_map(remapped, node_number, specs)
    return _ORIGINAL_BUILD_RESTRAINTS(metadata, edges, degrees, remapped, support_map)


def _component_owner_node(edge: base.Edge, semantic_types: set[str]) -> base.XmlNode | None:
    for node in (edge.to_node, edge.from_node):
        if _semantic_type_for_node(node, edge.branch_name) in semantic_types:
            return node
    return None


def _owner_identity(owner: base.XmlNode, branch_name: str) -> str:
    occurrence = _occurrence_for_node(owner.node_number, branch_name)
    return occurrence.occurrence_id if occurrence is not None else f"{branch_name}:{owner.node_number}"


def _build_component_indices(
    edges: list[base.Edge], semantic_types: set[str]
) -> tuple[list[base.Edge], dict[int, int]]:
    selected: list[base.Edge] = []
    edge_to_index: dict[int, int] = {}
    assigned: set[str] = set()
    for edge_index, edge in enumerate(edges):
        owner = _component_owner_node(edge, semantic_types)
        if owner is None:
            continue
        identity = _owner_identity(owner, edge.branch_name)
        if identity in assigned:
            continue
        selected.append(edge)
        edge_to_index[edge_index] = len(selected)
        assigned.add(identity)
    return selected, edge_to_index


def _bend_owner_node(edge: base.Edge) -> base.XmlNode | None:
    return _component_owner_node(edge, {"ELBO"})


def _sif_owner_node(edge: base.Edge) -> base.XmlNode | None:
    return _component_owner_node(edge, {"TEE", "OLET"})


def _reducer_helper_number(occ: ComponentOccurrence, port: SourceNodeRecord) -> int:
    """Resolve a negative PSI116 port to exactly one same-branch numbered node.

    Unlike branch connectivity aliases, this port cannot be borrowed from a
    neighboring branch. Positions use the existing 0.5 mm coincidence
    tolerance, measured as a Euclidean distance (not source record order).
    """
    key = (occ.occurrence_id, port.source_index)
    cached = _ACTIVE_TOPOLOGY.reducer_helper_nodes.get(key)
    if cached is not None:
        return cached
    candidates: set[int] = set()
    if port.position is not None:
        for record in _ACTIVE_TOPOLOGY.records:
            if (record.branch_index != occ.branch_index
                    or record.node_number is None or record.node_number <= 0
                    or record.position is None):
                continue
            distance = math.dist(port.position, record.position)
            if distance <= BRANCH_LINK_TOLERANCE_MM:
                candidates.add(record.node_number)
    if len(candidates) != 1:
        raise ValueError(
            f"REDUCERS refusal: reducer component '{occ.component_ref_no or occ.occurrence_id}' "
            f"in branch '{occ.branch_name}' Endpoint {port.endpoint} helper "
            f"has {len(candidates)} same-branch numbered nodes within "
            f"{BRANCH_LINK_TOLERANCE_MM} mm (need exactly one)."
        )
    number = _canonical_node_number(next(iter(candidates)))
    _ACTIVE_TOPOLOGY.reducer_helper_nodes[key] = number
    return number


def _reducer_source_port(occ: ComponentOccurrence, node: base.XmlNode) -> SourceNodeRecord | None:
    """Find the PSI116 reducer port represented by a positive model node."""
    canonical = _canonical_node_number(node.node_number)
    for record in occ.records:
        if (record.node_number is not None and record.node_number > 0
                and _canonical_node_number(record.node_number) == canonical):
            return record
    for record in occ.records:
        if record.node_number == -1 and _reducer_helper_number(occ, record) == canonical:
            return record
    return None


def _reducer_edge_occurrence(edge: base.Edge) -> ComponentOccurrence | None:
    """Both ends must be ports 1 and 2 of the SAME reducer occurrence."""
    matching: list[ComponentOccurrence] = []
    for occ in _ACTIVE_TOPOLOGY.reducer_occurrences_by_branch.get(edge.branch_name, ()):
        first = _reducer_source_port(occ, edge.from_node)
        second = _reducer_source_port(occ, edge.to_node)
        if (first is not None and second is not None
                and {first.endpoint, second.endpoint} == {1, 2}):
            matching.append(occ)
    if len(matching) > 1:
        refs = ", ".join(occ.component_ref_no for occ in matching)
        raise ValueError(
            f"REDUCERS refusal: branch '{edge.branch_name}' nodes "
            f"{edge.from_node.node_number}/{edge.to_node.node_number} "
            f"match multiple reducer components: {refs}."
        )
    return matching[0] if matching else None


def _reducer_taper_angle(
    node: base.XmlNode, branch_name: str, occ: ComponentOccurrence | None = None
) -> float | None:
    """Take AlphaAngle from this physical reducer's matched source port."""
    if occ is None:
        occ = _occurrence_for_node(node.node_number, branch_name)
    if occ is None or occ.semantic_type != "REDU":
        return None
    record = _reducer_source_port(occ, node)
    if record is None:
        return None
    values = [record.alpha_angle]
    # Only a reducer's OWN positive node can supply model-level AlphaAngle.
    # A coincident RIGID/PIPE endpoint resolving a negative helper cannot.
    if record.node_number is not None and record.node_number > 0:
        values.append(node.alpha_angle)
    for value in values:
        if value is not None and math.isfinite(value) and abs(value) > 1e-9:
            return value
    return None


def _reducer_owner_node(edge: base.Edge) -> base.XmlNode | None:
    """Return the real node carrying this same reducer's nonzero AlphaAngle."""
    occ = _reducer_edge_occurrence(edge)
    if occ is None:
        return None
    for node in (edge.to_node, edge.from_node):
        if _reducer_taper_angle(node, edge.branch_name, occ) is not None:
            return node
    return None


def _reducer_second_port(edge: base.Edge) -> base.XmlNode:
    """D2/T2 come from the numbered Endpoint-2 node, never the helper."""
    occ = _reducer_edge_occurrence(edge)
    if occ is not None:
        for node in (edge.to_node, edge.from_node):
            record = _reducer_source_port(occ, node)
            if record is not None and record.endpoint == 2:
                return node
    raise ValueError(
        f"REDUCERS refusal: branch '{edge.branch_name}' nodes "
        f"{edge.from_node.node_number}/{edge.to_node.node_number} "
        "have no resolved numbered Endpoint 2."
    )


def _build_bend_indices(edges: list[base.Edge]) -> tuple[list[base.Edge], dict[int, int]]:
    return _build_component_indices(edges, {"ELBO"})


def _build_sif_indices(edges: list[base.Edge]) -> tuple[list[base.Edge], dict[int, int]]:
    return _build_component_indices(edges, {"TEE", "OLET"})


def _build_reducer_indices(edges: list[base.Edge]) -> tuple[list[base.Edge], dict[int, int]]:
    """Choose one true Endpoint-1/2 internal edge per physical reducer.

    PSI116's -1 helper port is attached to a numbered neighboring-component
    node by unique same-branch position, never by ordering or a cross-branch
    coincidence. The approach edge has only one port of this reducer.
    """
    candidates: dict[str, list[tuple[tuple[int, int], int]]] = {}
    encountered = {
        occ.occurrence_id: occ
        for occ in _ACTIVE_TOPOLOGY.occurrences if occ.semantic_type == "REDU"
    }
    # Validate *every* negative helper up front. A missing/ambiguous helper
    # must be refused rather than silently dropping that component.
    for occ in encountered.values():
        for record in occ.records:
            if record.node_number == -1:
                _reducer_helper_number(occ, record)

    for edge_index, edge in enumerate(edges):
        occ = _reducer_edge_occurrence(edge)
        if occ is None:
            continue
        has_angle = any(
            _reducer_taper_angle(node, edge.branch_name, occ) is not None
            for node in (edge.from_node, edge.to_node)
        )
        diameter_change = abs(
            edge.from_node.outside_diameter - edge.to_node.outside_diameter
        ) > 1e-3
        rank = (int(has_angle), int(diameter_change))
        candidates.setdefault(occ.occurrence_id, []).append((rank, edge_index))

    selected: set[int] = set()
    for occ_id, occ in encountered.items():
        choices = candidates.get(occ_id, ())
        if not choices:
            raise ValueError(
                f"REDUCERS refusal: reducer component '{occ.component_ref_no or occ.occurrence_id}' "
                f"in branch '{occ.branch_name}' has no internal Endpoint 1-2 edge."
            )
        best = max(rank for rank, _ in choices)
        tied = [index for rank, index in choices if rank == best]
        if len(tied) != 1:
            raise ValueError(
                f"REDUCERS refusal: reducer component '{occ.component_ref_no or occ.occurrence_id}' "
                f"in branch '{occ.branch_name}' has {len(tied)} equally qualified internal edges."
            )
        selected.add(tied[0])

    reducer_edges: list[base.Edge] = []
    edge_to_index: dict[int, int] = {}
    for edge_index, edge in enumerate(edges):
        if edge_index in selected:
            reducer_edges.append(edge)
            edge_to_index[edge_index] = len(reducer_edges)
    return reducer_edges, edge_to_index


def _bend_reference_node(owner: base.XmlNode, edge: base.Edge) -> int:
    occurrence = _occurrence_for_node(owner.node_number, edge.branch_name)
    if occurrence is not None:
        for endpoint in (1, 2):
            for record in occurrence.records:
                if record.endpoint == endpoint and record.node_number is not None and record.node_number > 0:
                    candidate = _canonical_node_number(record.node_number)
                    if candidate != owner.node_number:
                        return candidate
    fallback = owner.node_number - 1
    _ACTIVE_TOPOLOGY.record_once(
        ("bend-reference-fallback", edge.branch_name, owner.node_number),
        "PSI116_BEND_REFERENCE_LEGACY_COMPAT",
        "No explicit positive PSI116 bend helper node was available; retained the legacy owner-node-minus-one CII reference.",
        branch=edge.branch_name,
        ownerNode=owner.node_number,
        fallbackNode=fallback,
    )
    return fallback


def _build_bend_payload(model: base.ConversionModel) -> list[str]:
    lines: list[str] = []
    for edge in model.bend_edges:
        owner = _bend_owner_node(edge)
        if owner is None:
            raise ValueError("BEND auxiliary edge has no PSI116 elbow component owner.")
        bend_type_value = 0.0 if owner.bend_type is None else float(owner.bend_type)
        radius = owner.bend_radius if owner.bend_radius > 0.0 else base._element_outside_diameter(edge)
        line1 = base._row([
            base._format_auto_float(radius),
            base._format_auto_float(bend_type_value),
            base._format_fixed_float(base.BEND_FLEXIBILITY_CONSTANT, 5),
            base._format_auto_float(float(_bend_reference_node(owner, edge))),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
        ])
        line2 = base._row([base._format_fixed_float(0.0, 6)] * 6)
        line3 = base._row([base._format_fixed_float(0.0, 6)] * 2)
        lines.extend([line1, line2, line3])
    return lines


def _description_for_owner(owner: base.XmlNode, edge: base.Edge, descriptions: dict[int, str]) -> str:
    direct = descriptions.get(owner.node_number, "")
    if direct:
        return direct
    occurrence = _occurrence_for_node(owner.node_number, edge.branch_name)
    if occurrence is None:
        return ""
    for source_number in occurrence.positive_node_numbers:
        if descriptions.get(source_number):
            return descriptions[source_number]
    return ""


def _sif_payload_factory(tee_desc_by_node: dict[int, str], support_config: dict):
    def _build_sif_payload(model: base.ConversionModel) -> list[str]:
        lines: list[str] = []
        zero_row = base._row([base._format_fixed_float(0.0, 6)] * 6)
        for edge in model.sif_edges:
            owner = _sif_owner_node(edge)
            if owner is None:
                raise ValueError("SIF&TEES auxiliary edge has no PSI116 tee/olet component owner.")
            desc = _description_for_owner(owner, edge, tee_desc_by_node)
            tee_type = direction._tee_sif_type_from_description(desc, support_config)
            lines.append(base._row([
                base._format_auto_float(float(owner.node_number)),
                base._format_fixed_float(float(tee_type), 5),
                base._format_fixed_float(0.0, 6),
                base._format_fixed_float(0.0, 6),
                base._format_fixed_float(0.0, 6),
                base._format_fixed_float(0.0, 6),
            ]))
            lines.extend([zero_row] * 9)
        return lines
    return _build_sif_payload


def _build_reducer_payload(model: base.ConversionModel) -> list[str]:
    lines: list[str] = []
    for edge in model.reducer_edges:
        occ = _reducer_edge_occurrence(edge)
        owner = _reducer_owner_node(edge)
        alpha = _reducer_taper_angle(owner, edge.branch_name, occ) if owner is not None else None
        if occ is None or owner is None or alpha is None:
            ref = occ.component_ref_no if occ is not None else "unpaired"
            raise ValueError(
                f"REDUCERS refusal: component '{ref}' branch '{edge.branch_name}' "
                f"nodes {edge.from_node.node_number}/{edge.to_node.node_number} "
                "has no PSI116 internal reducer owner/AlphaAngle."
            )
        second = _reducer_second_port(edge)
        if second.outside_diameter <= 0.0:
            raise ValueError(
                f"REDUCERS refusal: component '{occ.component_ref_no}' "
                f"Endpoint 2 has no positive OutsideDiameter."
            )
        # The angle carrier can be Endpoint 1 (reverse orientation), but
        # REDUCERS D2/T2 must always come from Endpoint 2. Never substitute
        # Endpoint 1's diameter/thickness for a missing second-port value.
        lines.append(base._row([
            base._format_auto_float(second.outside_diameter),
            base._format_auto_float(second.wall_thickness if second.wall_thickness > 0.0 else 0.0),
            base._format_fixed_float(alpha, 4),
            base._format_fixed_float(0.0, 6),
            base._format_fixed_float(0.0, 6),
        ]))
    return lines


def _audit_summary() -> dict[str, object]:
    type_counts = Counter(occurrence.semantic_type for occurrence in _ACTIVE_TOPOLOGY.occurrences)
    return {
        "schema": "psi116-component-topology-audit/v1",
        "sourcePath": _ACTIVE_TOPOLOGY.source_path,
        "sourceNodeRecords": len(_ACTIVE_TOPOLOGY.records),
        "componentOccurrences": len(_ACTIVE_TOPOLOGY.occurrences),
        "componentTypes": dict(sorted(type_counts.items())),
        "topologyLinks": [
            {"fromNode": left, "toNode": right}
            for left, right in sorted(_ACTIVE_TOPOLOGY.topology_links)
        ],
        "nodeAliases": {
            str(source): _canonical_node_number(source)
            for source in sorted(_ACTIVE_TOPOLOGY.node_aliases)
        },
        "diagnostics": list(_ACTIVE_TOPOLOGY.diagnostics),
    }


def _build_diagnostics_report(model: base.ConversionModel) -> str:
    report = _ORIGINAL_DIAGNOSTICS_REPORT(model).rstrip()
    return f"{report}\n\nPSI116 COMPONENT TOPOLOGY\n{json.dumps(_audit_summary(), indent=2, sort_keys=True)}\n"


def install_component_topology_patch() -> None:
    if getattr(base, "_PSI116_COMPONENT_TOPOLOGY_APPLIED", False):
        return
    base._parse_xml_document = _parse_xml_document_with_component_topology  # type: ignore[assignment]
    base._drop_short_element_nodes = _contract_short_element_nodes  # type: ignore[assignment]
    base._build_explicit_restraint_specs = _build_explicit_restraint_specs  # type: ignore[assignment]
    base._build_restraints = _build_restraints  # type: ignore[assignment]
    base._build_bend_indices = _build_bend_indices  # type: ignore[assignment]
    base._build_sif_indices = _build_sif_indices  # type: ignore[assignment]
    base._build_reducer_indices = _build_reducer_indices  # type: ignore[assignment]
    base._build_bend_payload = _build_bend_payload  # type: ignore[assignment]
    base._build_reducer_payload = _build_reducer_payload  # type: ignore[assignment]
    base._build_diagnostics_report = _build_diagnostics_report  # type: ignore[assignment]
    direction._sif_payload_factory = _sif_payload_factory  # type: ignore[assignment]
    base._PSI116_COMPONENT_TOPOLOGY_APPLIED = True


def install_short_span_contraction_patch() -> None:
    """Compatibility alias retained for existing imports/tests."""
    install_component_topology_patch()


install_component_topology_patch()


if __name__ == "__main__":
    direction.main()
