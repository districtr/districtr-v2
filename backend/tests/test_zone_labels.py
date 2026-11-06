"""District labels: the sanitizer the frontend mirrors, and the rules the
assignments PUT applies to map_metadata.zone_aliases and zone_order."""

import pytest

from app.models import (
    check_zone_labels_for_plan,
    clean_zone_aliases,
    sanitize_community_name,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        # The client twin (app/src/app/utils/sanitize.ts) used to disagree on
        # these three; app/src/app/utils/zoneLabels.test.ts checks the same strings.
        ("North\u001fShore", "North Shore"),
        ("North\u0085Shore", "North Shore"),
        ("North﻿Shore", "NorthShore"),
        # A dropped zero-width space or tag must not leave a result that a
        # second cleaning would change.
        ("North \u200b Shore", "North Shore"),
        ("e<x>\u0301", "\u00e9"),
    ],
)
def test_sanitizer_matches_the_client_twin(raw, expected):
    assert sanitize_community_name(raw) == expected
    assert sanitize_community_name(expected) == expected


def test_label_cap_leaves_no_trailing_space():
    """A cut at 40 that ends on a space is trimmed, so a stored label reads back
    unchanged; zoneLabels.test.ts checks the same string."""
    label = clean_zone_aliases({"1": "a" * 39 + " b"}, strict=True)["1"]
    assert label == "a" * 39
    assert clean_zone_aliases({"1": label}) == {"1": label}


def test_stored_labels_are_read_leniently():
    """GET responses drop stored keys that aren't district numbers rather than
    failing, and never call int() on a huge key."""
    assert clean_zone_aliases({"1": " A ", "x": "B", "9" * 5000: "C", "2": " "}) == {
        "1": "A"
    }


def test_label_rules_for_a_plan():
    assert check_zone_labels_for_plan({"1": "North", "2": "South"}, [2, 1], 4) is None
    # A district's default label is its number.
    assert "same label" in check_zone_labels_for_plan({"1": "3"}, None, 4)
    assert "same label" in check_zone_labels_for_plan({"1": "Ab", "2": "aB"}, None, 4)
    # Past the count, "5" is no district's default.
    assert check_zone_labels_for_plan({"1": "5"}, None, 4) is None
    assert "not in this plan" in check_zone_labels_for_plan({"5": "E"}, None, 4)
    assert "zone_order" in check_zone_labels_for_plan(None, [1, 5], 4)
