"""Text scoring and submission moderation.

The scorer (OpenAI moderation endpoint with a local profanity-list fallback)
is the single source of truth for the whole app.

Moderation is automatic-only: a score at/above MODERATION_THRESHOLD sets
`nsfw`, which the frontend renders blurred with an opt-in reveal. Reviewers
may flip `nsfw` both ways and hard-hide spam via the admin endpoints — there
is no approval gate.
"""

import logging

from sqlmodel import Session, col, select, update

from app.core.config import settings
from app.core.db import engine
from safetext import SafeText

logger = logging.getLogger(__name__)

st = SafeText(language="en")

MODERATION_THRESHOLD: float = 0.2


def rate_offensive_text_ai(text: str) -> tuple[bool, float] | None:
    """Score text via the OpenAI moderation endpoint.

    Returns (ok, score) with score in [0, 1] (1 = certainly offensive), or
    None when no OpenAI client is configured.
    """
    openai_client = settings.get_openai_client()
    if not openai_client:
        return None

    try:
        response = openai_client.moderations.create(
            input=text, model="omni-moderation-latest"
        )
        scores = response.results[0].category_scores
        return (True, max(scores.__dict__.values()))
    except Exception as e:
        logger.info(f"Error during moderation: {e}")
        return (False, 1.0)


def check_profanity(text: str) -> tuple[bool, float]:
    """Local profanity-list fallback. Returns (ok, score)."""
    try:
        profanity = st.check_profanity(text.strip())
        return (True, 1.0 if len(profanity) > 0 else 0.0)
    except Exception:
        return (False, 1.0)


def score_text(text: str) -> float:
    """Score text: 0 = clean, 1 = certainly offensive.

    Prefers the OpenAI moderation endpoint when configured, falling back to
    the local profanity list; scores 1.0 when both scorers error.
    """
    if not text or not text.strip():
        return 0.0

    if settings.OPENAI_API_KEY:
        result = rate_offensive_text_ai(text)
        if result and result[0]:
            return result[1]

    ok, score = check_profanity(text)
    if ok:
        return score

    return 1.0


def moderate_submission_by_id(
    submission_id: int, session: Session | None = None
) -> None:
    """Background task: score a submission's content + tags + map card text.

    Scores the concatenation of every content value, tag, and the attached
    map's metadata name/description — the gallery card renders the map's
    name/description, so leaving them unscored would let an abusive map
    title sail past the nsfw filter under a clean one-word comment. The only
    outcome is one blur bit, so per-field granularity buys nothing. Opens
    its own session when none is given (the background-task case: the
    request-scoped session is closed by the time this runs).
    """
    # Local import: models imports nothing from here, but keeping the module
    # import-light avoids cycles with app.models consumers.
    from app.models import Document
    from app.submissions.models import Submission, SubmissionContent

    def _run(sess: Session) -> None:
        submission = sess.get(Submission, submission_id)
        if submission is None:
            return
        values = sess.scalars(
            select(SubmissionContent.value).where(
                col(SubmissionContent.submission_id) == submission_id
            )
        ).all()
        map_texts: list[str] = []
        if submission.map_public_id is not None:
            metadata = sess.scalars(
                select(Document.map_metadata).where(
                    col(Document.public_id) == submission.map_public_id
                )
            ).first()
            if metadata:
                map_texts = [
                    str(metadata.get(key) or "") for key in ("name", "description")
                ]
        text = " ".join([*values, *(submission.tags or []), *map_texts])
        score = score_text(text)
        sess.execute(
            update(Submission)
            .where(col(Submission.id) == submission_id)
            .values(moderation_score=score, nsfw=score >= MODERATION_THRESHOLD)
        )
        try:
            sess.commit()
        except Exception:
            sess.rollback()
            logger.exception(
                f"Failed to save moderation score for submission {submission_id}"
            )
            raise

    if session is not None:
        _run(session)
    else:
        with Session(engine) as owned_session:
            _run(owned_session)
