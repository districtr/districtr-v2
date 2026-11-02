"""District labels: the sanitizer the frontend mirrors, and the rules the
assignments PUT applies to map_metadata.zone_aliases and zone_order."""

import pytest

from app.models import sanitize_community_name


@pytest.mark.parametrize(
    "raw, expected",
    [
        # The client twin (app/src/app/utils/sanitize.ts) used to disagree on
        # these three; app/src/app/utils/zoneLabels.test.ts checks the same strings.
        ("North\u001fShore", "North Shore"),
        ("North\u0085Shore", "North Shore"),
        ("North﻿Shore", "NorthShore"),
    ],
)
def test_sanitizer_matches_the_client_twin(raw, expected):
    assert sanitize_community_name(raw) == expected
