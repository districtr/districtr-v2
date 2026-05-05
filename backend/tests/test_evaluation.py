from datetime import datetime, timezone

from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.partisans import seats
from app.models import DistrictUnionsResponse


class _StubEvaluationContext(DocumentEvaluationContext):
    def __init__(self, district_stats: list[DistrictUnionsResponse]):
        super().__init__(
            background_tasks=None,  # type: ignore[arg-type]
            session=None,  # type: ignore[arg-type]
            document_id="stub",
        )
        self._stub_district_stats = district_stats

    def district_stats(self) -> list[DistrictUnionsResponse]:
        return self._stub_district_stats


def test_seats_returns_empty_when_no_district_stats():
    context = _StubEvaluationContext([])
    assert seats(context) == {}


def test_seats_returns_empty_when_demographic_data_missing():
    context = _StubEvaluationContext(
        [
            DistrictUnionsResponse(
                zone=1,
                geometry=None,
                demographic_data=None,
                updated_at=datetime.now(timezone.utc),
            )
        ]
    )
    assert seats(context) == {}


def test_seats_counts_party_wins_per_election():
    now = datetime.now(timezone.utc)
    context = _StubEvaluationContext(
        [
            DistrictUnionsResponse(
                zone=1,
                geometry=None,
                demographic_data={
                    "pres_dem": 60,
                    "pres_rep": 40,
                    "sen_dem": 51,
                    "sen_rep": 49,
                },
                updated_at=now,
            ),
            DistrictUnionsResponse(
                zone=2,
                geometry=None,
                demographic_data={
                    "pres_dem": 45,
                    "pres_rep": 55,
                    "sen_dem": 50,
                    "sen_rep": 50,
                },
                updated_at=now,
            ),
        ]
    )

    assert seats(context) == {
        "pres": {"dem": 1, "rep": 1},
        "sen": {"dem": 1, "rep": 0},
    }
