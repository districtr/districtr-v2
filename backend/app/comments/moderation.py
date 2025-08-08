"""Profanity detection and scoring for comments system."""

import logging
from sqlmodel import Session, Table, update
from openai import OpenAI
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
openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

logger = logging.getLogger(__name__)


# PROFANITY_SCORE_THRESHOLD: float = 0.5 # unused?
MODERATION_THRESHOLD: float = 0.4


def rate_offensive_text_ai(text: str) -> ModerationScore:
    """
    Rates how offensive or inappropriate the given text is.
    Returns a float between 0 (not offensive) and 1 (certainly offensive).
    """

    try:
        response = openai_client.moderations.create(
            input=text, model="omni-moderation-latest"
        )
        scores = response.results[0].category_scores
        # Add other scores as needed
        worst_score = max(
            [
                scores.violence,
                scores.harassment,
                scores.sexual,
                scores.hate,
                scores.illicit,
            ]
        )
        return ModerationScore(ok=True, score=worst_score)
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
        if result.ok:
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
        logger.error(f"Failed to save commenter moderation score: {e}")


def moderate_submission(
    response: FullCommentForm,
    session: Session,
) -> None:
    """
    Background task to check moderation scores for a complete comment submission.
    Returns a dictionary with moderation scores for all components.
    """
    comment_text = f"{response.comment.title} {response.comment.comment}"
    moderate_text(
        cls=Comment, key=response.comment.id, text=comment_text, session=session
    )

    commenter_data = str(response.commenter)
    moderate_text(
        cls=Commenter, key=response.commenter.id, text=commenter_data, session=session
    )

    for tag in response.tags:
        moderate_text(cls=Tag, key=tag.id, text=tag.slug, session=session)
