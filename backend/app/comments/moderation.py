"""Profanity detection and scoring for comments system."""

import logging
from sqlmodel import Session, Table, update

from app.core.db import engine
from safetext import SafeText

from app.comments.models import (
    Comment,
    Commenter,
    Tag,
    FullCommentForm,
    ModerationScore,
)
from app.core.config import settings

st = SafeText(language="en")

logger = logging.getLogger(__name__)


MODERATION_THRESHOLD: float = 0.2


def rate_offensive_text_ai(text: str) -> ModerationScore | None:
    """
    Rates how offensive or inappropriate the given text is.
    Returns a float between 0 (not offensive) and 1 (certainly offensive).
    """
    openai_client = settings.get_openai_client()
    if not openai_client:
        return

    try:
        response = openai_client.moderations.create(
            input=text, model="omni-moderation-latest"
        )
        scores = response.results[0].category_scores
        # get all score values
        score_values = list(scores.__dict__.values())
        return ModerationScore(ok=True, score=max(score_values))
    except Exception as e:
        logger.info(f"Error during moderation: {e}")
        return ModerationScore(ok=False, score=1.0, error=str(e))


def check_profanity(text: str) -> ModerationScore:
    """
    Rates how offensive or inappropriate the given text is.
    Returns a float between 0 (not offensive) and 1 (certainly offensive).
    """
    try:
        profanity = st.check_profanity(text.strip())
        return ModerationScore(ok=True, score=1.0 if len(profanity) > 0 else 0.0)
    except Exception as e:
        return ModerationScore(ok=False, score=1.0, error=str(e))


def score_text(text: str) -> float:
    """
    Check profanity score for a given text using better-profanity library.
    Returns 1.0 if profane, 0.0 if clean.
    """
    # TODO: add AI check and use this as a fallback
    if not text or not text.strip():
        return 0.0

    if settings.OPENAI_API_KEY:
        result = rate_offensive_text_ai(text)
        if result and result.ok:
            return result.score

    result = check_profanity(text)
    if result.ok:
        return result.score

    return 1.0


def moderate_text(cls: Table, key: int, text: str, session: Session) -> float:
    """
    Check profanity score for save to database.
    Returns the profanity score.
    """
    score = score_text(text)
    update_moderation_score(cls, key, score, session)

    return score


def update_moderation_score(
    cls: Table, key: int, score: float, session: Session
) -> None:
    stmt = update(cls).where(cls.id == key).values(moderation_score=score)  # type: ignore
    session.execute(stmt)

    try:
        session.commit()
        logger.info(
            f"Saved {type(cls).__name__} moderation score: {key}, score={score}"
        )
    except Exception as e:
        session.rollback()
        logger.error(
            f"Failed to save moderation score for {type(cls).__name__} id={key}: {e}"
        )
        # Re-raise so background-task runners surface the failure instead of leaving
        # moderation_score silently NULL.
        raise


def _moderate(cls: Table, key: int, text: str, session: Session | None) -> None:
    """Score ``text`` and persist the result for ``cls``/``key``.

    When ``session`` is None (the background-task case) a dedicated session is
    opened and closed here. Background tasks must not reuse the request-scoped
    session: it is already closed by the time they run, so any connection they then
    check out would never be returned to the pool (a leak).
    """
    if session is not None:
        moderate_text(cls=cls, key=key, text=text, session=session)
    else:
        with Session(engine) as owned_session:
            moderate_text(cls=cls, key=key, text=text, session=owned_session)


def moderate_comment(comment: Comment, session: Session | None = None) -> None:
    comment_text = f"{comment.title} {comment.comment}"
    _moderate(Comment, comment.id, comment_text, session)


def moderate_comment_by_id(comment_id: int, comment_text: str) -> None:
    """
    Moderate a comment by ID. Use when the Comment object may be detached
    (e.g. in background tasks after request session is closed).
    """
    _moderate(Comment, comment_id, comment_text, None)


def moderate_commenter(commenter: Commenter, session: Session | None = None) -> None:
    _moderate(Commenter, commenter.id, str(commenter), session)


def moderate_tag(tag: Tag, session: Session | None = None) -> None:
    _moderate(Tag, tag.id, str(tag), session)


def moderate_submission(
    response: FullCommentForm,
    session: Session | None = None,
) -> None:
    """
    Background task to check moderation scores for a complete comment submission.
    Each entity is scored on its own session when none is supplied.
    """
    moderate_comment(response.comment, session)
    moderate_commenter(response.commenter, session)
    for tag in response.tags:
        moderate_tag(tag, session)
