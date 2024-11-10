from uuid import uuid4
import requests
from app.main import get_session
from app.models import UUIDType
from alembic import op
from sqlalchemy.sql import text
from sqlalchemy import text, bindparam
from sqlmodel import (
    UUID,
    String,
    Integer,
    ARRAY,
)


def load_dv1_places():
    response = requests.get("https://districtr.org/assets/data/landing_pages.json?v=2")
    states = response.json()
    places_to_upsert = []
    for st in states:
        state_data = []
        for mod in st["modules"]:
            for place in mod["ids"]:
                state_data.append(
                    {
                        "name": None,
                        "id": place,
                        "place_type": mod["id"],
                        "state": st["code"],
                    }
                )
        places_to_upsert.append({"state": st["state"], "data": state_data})
    return places_to_upsert


def assign_problems_to_places(places):
    """
    hits each state-specific endpoint; adds human readable name to each place
    and associates problems with each place. this will let us populate the database
    with the correct data for the districtr_v1 places
    """
    for place in places:

        try:
            state_places = requests.get(
                f"https://districtr.org/assets/data/modules/{place['state'].lower()}.json"
            ).json()
            print("got place: ", place["state"].lower())
            for state_place in state_places:
                for place_from_all in place["data"]:
                    if state_place["id"] == place_from_all["id"]:
                        place_from_all["name"] = state_place["name"]
                        place_from_all["districtr_problems"] = state_place[
                            "districtingProblems"
                        ]
                        # change the key name to match the database
                        for problem in place_from_all["districtr_problems"]:
                            problem["plural_noun"] = problem.pop("pluralNoun")
                            problem["num_parts"] = problem.pop("numberOfParts")

        except Exception as e:
            print(f"Error loading {place['state']}: {e}")
    return places


def upsert_places_and_problems(places):
    """
    Upsert places and problems into the database based on the data from districtr_v1 formatted as dict.
    """
    session = next(get_session())
    for state in places:
        for place in state["data"]:
            # Check if place already exists and retrieve its UUID if so
            existing_place = session.execute(
                text(
                    """
                    SELECT uuid FROM districtrplace WHERE id = :id AND state = :state
                    """
                ),
                {"id": place["id"], "state": state["state"]},
            ).fetchone()

            # If place exists, use its UUID; otherwise, create a new UUID
            place_uuid = UUID(existing_place[0]) if existing_place else uuid4()

            # Insert or update the place entry
            stmt = text(
                """
                INSERT INTO districtrplace (uuid, name, id, place_type, state, districtr_problems)
                VALUES (:uuid, :name, :id, :place_type, :state, :districtr_problems)
                ON CONFLICT (id, place_type, state) DO UPDATE
                SET name = :name, place_type = :place_type, state = :state, districtr_problems = :districtr_problems
                """
            ).bindparams(
                bindparam(key="uuid", type_=UUIDType),
                bindparam(key="name", type_=String),
                bindparam(key="id", type_=String),
                bindparam(key="place_type", type_=String),
                bindparam(key="state", type_=String),
                bindparam(key="districtr_problems", type_=ARRAY(UUIDType)),
            )

            # Handle problems per place
            problem_uuids = []
            try:
                if place["districtr_problems"]:
                    for problem in place["districtr_problems"]:
                        # Insert or update each problem entry, using the existing or new place UUID
                        problem_uuid = uuid4()
                        problem_stmt = text(
                            """
                            INSERT INTO public.districtrproblems (uuid, name, num_parts, plural_noun, districtr_place_id)
                            VALUES (:uuid, :name, :num_parts, :plural_noun, :districtr_place_id)
                            ON CONFLICT (name, districtr_place_id) DO UPDATE
                            SET uuid = :uuid, name = :name, num_parts = :num_parts, plural_noun = :plural_noun, districtr_place_id = :districtr_place_id
                            """
                        ).bindparams(
                            bindparam(key="uuid", type_=UUIDType),
                            bindparam(key="name", type_=String),
                            bindparam(key="num_parts", type_=Integer),
                            bindparam(key="plural_noun", type_=String),
                            bindparam(key="districtr_place_id", type_=UUIDType),
                        )
                        session.execute(
                            problem_stmt,
                            {
                                "uuid": problem_uuid,
                                "name": problem["name"],
                                "num_parts": problem["num_parts"],
                                "plural_noun": problem["plural_noun"],
                                "districtr_place_id": place_uuid,
                            },
                        )

                        # Get the UUID of the inserted or updated problem
                        problem_uuid_result = session.execute(
                            text(
                                """
                                SELECT uuid
                                FROM public.districtrproblems
                                WHERE name = :name AND districtr_place_id = :districtr_place_id
                                """
                            ).bindparams(
                                bindparam(key="name", type_=String),
                                bindparam(key="districtr_place_id", type_=String),
                            ),
                            {"name": problem["name"], "districtr_place_id": place_uuid},
                        ).fetchone()[0]
                        problem_uuids.append(problem_uuid_result)
            except Exception as e:
                print(f"No places found for place {place['name']}: {e}")

            # if place name is missing or no problems are found, skip this place
            # places like marinco (marin county school districts) have no problems
            # and appear in landing_pages as a place, but not in california.json
            # separately, indiannapolis_cc is keys as both a city and a county, and
            # appears with the same id under both city and county places
            if place["name"] and len(problem_uuids) > 0:
                session.execute(
                    stmt,
                    {
                        "uuid": place_uuid,
                        "name": place["name"],
                        "id": place["id"],
                        "place_type": place["place_type"],
                        "state": state["state"],
                        "districtr_problems": problem_uuids,
                    },
                )
            else:
                print(f"Skipping place {place['id']} in {state['state']}")
    session.commit()


def populate_existing_districtr_maps():
    """
    Pretty hacky way to assign a random problem to each existing map in the database based
    on the matching state-level place id. in practice we will want to refine the place->problem->map
    pipeline based on user flow.
    """
    state_abbr_to_name = {
        "co": "Colorado",
        "ri": "Rhode Island",
        "de": "Delaware",
        "ks": "Kansas",
        "ga": "Georgia",
        "pa": "Pennsylvania",
    }
    session = next(get_session())

    # Retrieve all entries from districtrmaps
    maps_entries = session.execute(
        text("SELECT uuid, gerrydb_table_name FROM public.districtrmap")
    ).fetchall()

    for entry in maps_entries:
        map_id = entry.uuid
        gerrydb_table_name = entry.gerrydb_table_name

        # Extract the state abbreviation from the table_name prefix
        state_abbr = gerrydb_table_name.split("_")[0]

        # Map the abbreviation to the full state name
        state_name = state_abbr_to_name.get(state_abbr.lower())
        if not state_name:
            print(
                f"Skipping unknown state abbreviation for table_name {gerrydb_table_name}"
            )
            continue

        # Find the place ID for the full state name
        place_result = session.execute(
            text(
                """
                SELECT uuid FROM public.districtrplace
                WHERE state = :state_name AND place_type = 'state'
            """
            ),
            {"state_name": state_name},
        ).fetchone()

        if not place_result:
            print(f"No place found for state {state_name}")
            continue

        place_id = place_result.uuid

        # Retrieve a random problem for the selected place_id
        problem_result = session.execute(
            text(
                """
                SELECT num_parts FROM public.districtrproblems
                WHERE districtr_place_id = :place_id
                ORDER BY random()
                LIMIT 1
            """
            ),
            {"place_id": place_id},
        ).fetchone()

        if not problem_result:
            print(f"No problems found for place ID {place_id}")
            continue

        problem_num_parts = problem_result.num_parts

        # Associate the place_id and problem_id with the current map entry
        session.execute(
            text(
                """
                UPDATE public.districtrmap
                SET districtr_place_id = :place_id, num_districts = :num_parts
                WHERE uuid = :map_id
            """
            ),
            {"place_id": place_id, "num_parts": problem_num_parts, "map_id": map_id},
        )
        print(
            f"Updated map entry {map_id} with place_id {place_id} with {problem_num_parts} target districts"
        )
        session.commit()


if __name__ == "__main__":
    places = load_dv1_places()
    places = assign_problems_to_places(places)
    upsert_places_and_problems(places)
