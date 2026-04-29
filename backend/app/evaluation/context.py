from dataclasses import dataclass, field
from typing import Any
from sqlmodel import Session
from app.utils import update_or_select_district_stats
from fastapi import BackgroundTasks


@dataclass
class EvaluationContext:
    background_tasks: BackgroundTasks
    session: Session
    document_id: str
    _cache: dict[str, Any] = field(default_factory=dict)

    def district_stats(self):
        if "district_stats" not in self._cache:
            self._cache["district_stats"] = update_or_select_district_stats(
                self.session, self.document_id, self.background_tasks
            )
        return self._cache["district_stats"]
