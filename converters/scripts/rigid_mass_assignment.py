"""Element-level RIGID mass allocation for the XML -> CII 2019 exporter.

The XML Node/Weight field is component metadata, *not* a point load.  Only
RIGID-eligible edges in the emitted, short-element-filtered topology participate.
Each component's source mass is counted once and split over its surviving
CII elements in proportion to their actual 3-D lengths.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import math
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class ElementRigidMass:
    """Resolved mass for one emitted RIGID element (before unit scaling)."""

    from_node: int
    to_node: int
    length_mm: float
    component_key: str
    allocation_rule: str
    component_mass: float
    resolved_mass: float


def _component_ref(node: Any) -> str:
    """Normalize a physical component's upstream reference, if supplied."""
    return "".join(str(getattr(node, "component_ref_no", "") or "").split()).lstrip("=").upper()


def _mass(value: Any, description: str) -> float:
    mass = float(value)
    if not math.isfinite(mass) or mass < 0.0:
        raise ValueError(f"Invalid negative or non-finite RIGID component weight for {description}: {value!r}")
    return mass


def _element_length_mm(edge: Any) -> float:
    length = math.dist(edge.from_node.position, edge.to_node.position)
    if not math.isfinite(length):
        raise ValueError(
            f"Non-finite RIGID element length {edge.from_node.node_number} -> {edge.to_node.node_number}"
        )
    return length


def resolve_element_rigid_masses(
    edges: Sequence[Any],
    rigid_indices: Mapping[int, int],
    *,
    mass_source_nodes_by_branch: Mapping[str, Sequence[Any]] | None = None,
) -> dict[int, ElementRigidMass]:
    """Resolve mass for each *surviving* CII RIGID auxiliary.

    A TO-node ComponentRefNo owns an element when present.  Positive weights
    for the same physical reference are duplicate descriptions of *one* mass,
    not additive point masses. Different positive weights for the same
    reference are ambiguous and cause an explicit error.

    For a component represented by several eligible elements, mass is
    allocated by actual element length. Without a ComponentRefNo the
    conservative fallback treats the TO node as the owner; if several edges
    have that same TO node, it still apportions its weight only once. A blank
    flange must never inherit the preceding RIGID node's weight.

    Return keys are zero-based emitted element indices; RIGID indices remain
    1-based and are *not* redefined here. Zero source mass is emitted as zero.
    """
    ordered_indices = sorted(rigid_indices)
    expected = list(range(1, len(ordered_indices) + 1))
    if [rigid_indices[i] for i in ordered_indices] != expected:
        raise ValueError("CII RIGID pointers must follow emitted element order from 1")
    if any(i < 0 or i >= len(edges) for i in ordered_indices):
        raise ValueError("RIGID pointer references a missing emitted element")

    groups: dict[tuple[str, ...], list[tuple[int, Any, float]]] = defaultdict(list)
    for edge_index in ordered_indices:
        edge = edges[edge_index]
        ref = _component_ref(edge.to_node)
        if ref:
            key = ("ref", edge.branch_name, ref)
        else:
            # No source identity: never presume that adjoining nodes' Weight
            # values are the same physical mass. The owning TO node alone is
            # associated with this CII element.
            key = ("to-node", str(edge.to_node.node_number))
        groups[key].append((edge_index, edge, _element_length_mm(edge)))

    # Preserve source-node provenance through short-element pruning: a removed
    # 2 mm hop can still carry the unique physical component mass, while the
    # retained 20/40 mm elements receive the actual allocated mass.
    referenced_weights: dict[tuple[str, ...], list[float]] = defaultdict(list)
    if mass_source_nodes_by_branch is None:
        source_node_pairs = (
            (edge.branch_name, node)
            for edge in edges
            for node in (edge.from_node, edge.to_node)
        )
    else:
        source_node_pairs = (
            (branch_name, node)
            for branch_name, source_nodes in mass_source_nodes_by_branch.items()
            for node in source_nodes
        )
    for branch_name, source_node in source_node_pairs:
        ref = _component_ref(source_node)
        if ref:
            key = ("ref", branch_name, ref)
            if key in groups:
                weight = _mass(source_node.weight, f"{key} NodeNumber {source_node.node_number}")
                if weight > 0.0:
                    referenced_weights[key].append(weight)

    assignments: dict[int, ElementRigidMass] = {}
    for key, items in groups.items():
        if key[0] == "ref":
            sources = referenced_weights.get(key, [])
        else:
            sources = [
                _mass(edge.to_node.weight, f"{key} NodeNumber {edge.to_node.node_number}")
                for _, edge, _ in items
                if edge.to_node.weight != 0.0
            ]
        component_mass = sources[0] if sources else 0.0
        if any(
            not math.isclose(component_mass, value, rel_tol=1e-9, abs_tol=1e-9)
            for value in sources[1:]
        ):
            raise ValueError(
                f"Conflicting source weights for RIGID component {key}: {sorted(set(sources))}"
            )

        length_sum = math.fsum(length for _, _, length in items)
        if component_mass > 0.0 and len(items) > 1 and length_sum <= 0.0:
            raise ValueError(f"Cannot apportion RIGID component {key}: all emitted lengths are zero")

        if component_mass == 0.0:
            rule = "missing-or-zero-component-weight"
        elif len(items) == 1:
            rule = "single-element-component"
        else:
            rule = "component-length-proportional"

        allocated = 0.0
        for item_index, (edge_index, edge, length) in enumerate(items):
            if component_mass == 0.0:
                resolved = 0.0
            elif len(items) == 1:
                resolved = component_mass
            elif item_index == len(items) - 1:
                # Compensate floating rounding to conserve the exact total.
                resolved = component_mass - allocated
            else:
                resolved = component_mass * length / length_sum
                allocated += resolved

            assignments[edge_index] = ElementRigidMass(
                from_node=edge.from_node.node_number,
                to_node=edge.to_node.node_number,
                length_mm=length,
                component_key="/".join(key),
                allocation_rule=rule,
                component_mass=component_mass,
                resolved_mass=resolved,
            )

    return assignments
