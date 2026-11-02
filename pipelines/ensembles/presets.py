"""Ensemble presets: one entry per chain configuration offered to users.

Preset keys are stable identifiers stored with every ensemble; labels are the
display names. Variant names are rustrecom's CLI spellings, following the
ReCom-A/B/C/D taxonomy of Cannon, Duchin, Randall & Rule (2025).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Preset:
    key: str
    label: str
    variant: str
    # Node attribute -> spanning-tree surcharge for region-aware variants.
    region_weights: dict[str, float] = field(default_factory=dict)


PRESETS: dict[str, Preset] = {
    p.key: p
    for p in (
        Preset(
            key="recom_b",
            label="ReCom-B",
            variant="district-pairs-mst",
        ),
        Preset(
            key="recom_b_county",
            label="ReCom-B, county-aware",
            variant="district-pairs-region-aware",
            region_weights={"county": 1.0},
        ),
    )
}

DEFAULT_PRESET = "recom_b"
