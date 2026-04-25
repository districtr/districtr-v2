from app.evaluation.registry import (
    Metric,
    current_payload_version,
)


def _noop(_doc):
    return None


def test_empty_manifest_hashes_to_sha256_of_empty_string():
    """No special-case sentinel: the empty manifest produces the
    truncated SHA-256 of the empty string, like any other input."""
    # Computed once from sha256(b"").digest()[:8] big-endian, top bit cleared.
    EXPECTED_EMPTY = 7183457195969485844
    assert current_payload_version(()) == EXPECTED_EMPTY


def test_version_changes_when_metric_added():
    empty: tuple[Metric, ...] = ()
    one = (Metric(key="alpha", version=1, compute=_noop),)

    v_empty = current_payload_version(empty)
    v_one = current_payload_version(one)

    assert v_empty != v_one


def test_version_independent_of_manifest_order():
    forward = (
        Metric(key="alpha", version=1, compute=_noop),
        Metric(key="beta", version=3, compute=_noop),
    )
    backward = (
        Metric(key="beta", version=3, compute=_noop),
        Metric(key="alpha", version=1, compute=_noop),
    )
    assert current_payload_version(forward) == current_payload_version(backward)


def test_version_changes_on_per_metric_version_bump():
    before = (Metric(key="alpha", version=1, compute=_noop),)
    after = (Metric(key="alpha", version=2, compute=_noop),)
    assert current_payload_version(before) != current_payload_version(after)


def test_version_changes_when_metric_removed():
    two = (
        Metric(key="alpha", version=1, compute=_noop),
        Metric(key="beta", version=1, compute=_noop),
    )
    one = (Metric(key="alpha", version=1, compute=_noop),)
    assert current_payload_version(two) != current_payload_version(one)
