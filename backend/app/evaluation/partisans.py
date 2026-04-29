from app.evaluation.context import EvaluationContext
from app.models import DistrictUnionsResponse


def seats(context: EvaluationContext) -> dict[str, dict[str, int]]:
    district_stats: list[DistrictUnionsResponse] = context.district_stats()
    if not district_stats or not district_stats[0].demographic_data:
        return {}
    demographic_cols = district_stats[0].demographic_data.keys()
    election_cols: list[str] = [
        s.strip("_dem") for s in demographic_cols if s.endswith("_dem")
    ]

    if not election_cols:
        return {}

    result: dict[str, dict[str, int]] = {}
    for col in election_cols:
        dem_seats = 0
        rep_seats = 0
        for district_stat in district_stats:
            assert district_stat.demographic_data
            if (
                district_stat.demographic_data[col + "_dem"]
                > district_stat.demographic_data[col + "_rep"]
            ):
                dem_seats += 1
            elif (
                district_stat.demographic_data[col + "_rep"]
                > district_stat.demographic_data[col + "_dem"]
            ):
                rep_seats += 1
        result[col] = {"dem": dem_seats, "rep": rep_seats}
    return result
