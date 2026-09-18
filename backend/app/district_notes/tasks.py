"""Background moderation for district notes."""

import logging

from sqlmodel import Session, col
from sqlalchemy import update

from app.core.db import engine
from app.district_notes.models import DistrictNote

logger = logging.getLogger(__name__)


def moderate_note_by_id(
    note_id: int, text: str, session: Session | None = None
) -> None:
    """Background task: score a note's text and persist score + nsfw.

    When ``session`` is None (the background-task case) a dedicated session is
    opened; the request-scoped session is closed by the time background tasks
    run (see app.submissions.moderation).
    """
    from app.submissions.moderation import MODERATION_THRESHOLD, score_text

    score = score_text(text)

    def _write(sess: Session) -> None:
        sess.execute(
            update(DistrictNote)
            .where(col(DistrictNote.id) == note_id)
            .values(moderation_score=score, nsfw=score >= MODERATION_THRESHOLD)
        )
        try:
            sess.commit()
        except Exception:
            sess.rollback()
            logger.exception(f"Failed to save moderation score for note {note_id}")
            raise

    if session is not None:
        _write(session)
    else:
        with Session(engine) as owned_session:
            _write(owned_session)
