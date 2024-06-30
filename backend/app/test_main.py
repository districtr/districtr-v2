from pymongo.results import InsertOneResult
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.main import app, get_session
from app.core.db import get_mongo_database

client = TestClient(app)


def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}


def test_get_session():
    session = get_session()
    assert session is not None
    for s in session:
        assert isinstance(s, Session)


## Test DB


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def get_auth_result_override():
        return True

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app, headers={"origin": "http://localhost:5173"})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="plan")
def plan_id_fixture() -> InsertOneResult:
    db = get_mongo_database()
    return db.plans.insert_one({"geoid": "06067001102", "zone": 1})


def test_get_plan(client: TestClient, plan: InsertOneResult):
    print(plan.inserted_id)
    response = client.get(f"/plan/{plan.inserted_id}")
    assert response.status_code == 200


def test_get_missing_plan(client: TestClient):
    response = client.get("/plan/6680e7d8b65f636e1a966c3e")
    data = response.json()
    assert response.status_code == 404
    assert data["detail"] == "Plan not found"
