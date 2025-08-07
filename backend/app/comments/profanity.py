"""Profanity detection and scoring for comments system."""

import logging
from sqlmodel import Session
from openai import OpenAI
from safetext import SafeText

from app.comments.models import (
    CommentProfanity,
    CommenterProfanity,
    TagProfanity,
    FullCommentForm,
)
from app.core.config import settings

st = SafeText(language="en")
openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

logger = logging.getLogger(__name__)


def rate_offensive_text_ai(text: str) -> float:
    """
    Rates how offensive or inappropriate the given text is.
    Returns a float between 0 (not offensive) and 1 (certainly offensive).
    """

    try:
        response = openai_client.moderations.create(
            input=text, model="omni-moderation-latest"
        )
        return {
            "ok": True,
            "score": max(response.results[0].category_scores.to_dict().values()),
        }
    except Exception as e:
        print(f"Error during moderation: {e}")
        return {
            "ok": False,
            "error": str(e),
        }


def rate_offensive_text_simple(text: str) -> float:
    """
    Rates how offensive or inappropriate the given text is.
    Returns a float between 0 (not offensive) and 1 (certainly offensive).
    """
    try:
        return {
            "ok": True,
            "score": 1.0 if len(st.check_profanity(text.strip())) > 0 else 0.0,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
        }


def check_profanity_score(text: str) -> float:
    """
    Check profanity score for a given text using better-profanity library.
    Returns 1.0 if profane, 0.0 if clean.
    """
    # TODO: add AI check and use this as a fallback
    if not text or not text.strip():
        return 0.0

    try:
        if settings.OPENAI_API_KEY:
            result = rate_offensive_text_ai(text)
            if result["ok"]:
                return result["score"]
            else:
                logger.error(
                    f"Error using openAI profanity for text: {result['error']}"
                )
        result = rate_offensive_text_simple(text)
        if result["ok"]:
            return result["score"]
        else:
            logger.error(f"Error using simple profanity for text: {result['error']}")
    except Exception as e:
        logger.error(f"Error checking profanity for text: {e}")
        return 1.0


def check_comment_profanity(
    comment_id: int, comment_text: str, session: Session
) -> float:
    """
    Check profanity score for a comment and save to database.
    Returns the profanity score.
    """
    score = check_profanity_score(comment_text)

    # Save profanity score to database
    comment_profanity = CommentProfanity(comment_id=comment_id, profanity_score=score)
    session.add(comment_profanity)

    try:
        session.commit()
        logger.info(
            f"Saved comment profanity score: comment_id={comment_id}, score={score}"
        )
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save comment profanity score: {e}")

    return score


def check_commenter_profanity(
    commenter_id: int, commenter_data: dict, session: Session
) -> float:
    """
    Check profanity score for commenter fields and save to database.
    Returns the profanity score.
    """
    # Combine all commenter text fields for profanity checking
    text_parts = []
    if commenter_data.get("first_name"):
        text_parts.append(commenter_data["first_name"])
    if commenter_data.get("last_name"):
        text_parts.append(commenter_data["last_name"])
    if commenter_data.get("salutation"):
        text_parts.append(commenter_data["salutation"])
    if commenter_data.get("place"):
        text_parts.append(commenter_data["place"])
    if commenter_data.get("state"):
        text_parts.append(commenter_data["state"])

    combined_text = " ".join(text_parts)
    score = check_profanity_score(combined_text)

    # Save profanity score to database
    commenter_profanity = CommenterProfanity(
        commenter_id=commenter_id, profanity_score=score
    )
    session.add(commenter_profanity)

    try:
        session.commit()
        logger.info(
            f"Saved commenter profanity score: commenter_id={commenter_id}, score={score}"
        )
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save commenter profanity score: {e}")

    return score


def check_tag_profanity(tag_id: int, tag_slug: str, session: Session) -> float:
    """
    Check profanity score for a tag and save to database.
    Returns the profanity score.
    """
    score = check_profanity_score(tag_slug)

    # Save profanity score to database
    tag_profanity = TagProfanity(tag_id=tag_id, profanity_score=score)
    session.add(tag_profanity)

    try:
        session.commit()
        logger.info(f"Saved tag profanity score: tag_id={tag_id}, score={score}")
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save tag profanity score: {e}")

    return score


def check_submission_profanity(
    comment_id: int,
    commenter_id: int,
    tag_ids: list[int],
    form_data: FullCommentForm,
    session: Session,
) -> dict:
    """
    Background task to check profanity scores for a complete comment submission.
    Returns a dictionary with profanity scores for all components.
    """
    logger.info(f"Starting profanity check for submission: comment_id={comment_id}")

    results = {
        "comment_score": 0.0,
        "commenter_score": 0.0,
        "tag_scores": [],
        "exceeds_threshold": False,
    }

    try:
        # Check comment profanity
        comment_text = f"{form_data.comment.title} {form_data.comment.comment}"
        results["comment_score"] = check_comment_profanity(
            comment_id, comment_text, session
        )

        # Check commenter profanity
        commenter_data = form_data.commenter.model_dump()
        results["commenter_score"] = check_commenter_profanity(
            commenter_id, commenter_data, session
        )

        # Check tag profanity
        for i, tag_create in enumerate(form_data.tags):
            if i < len(tag_ids):
                tag_score = check_tag_profanity(tag_ids[i], tag_create.tag, session)
                results["tag_scores"].append(tag_score)

        # Determine if any score exceeds threshold
        max_score = max(
            [results["comment_score"], results["commenter_score"]]
            + results["tag_scores"]
        )

        results["exceeds_threshold"] = max_score >= settings.PROFANITY_SCORE_THRESHOLD

        if results["exceeds_threshold"]:
            logger.warning(
                f"Submission exceeds profanity threshold: comment_id={comment_id}, max_score={max_score}"
            )

        logger.info(
            f"Completed profanity check for submission: comment_id={comment_id}"
        )

    except Exception as e:
        logger.error(
            f"Error during profanity check for submission comment_id={comment_id}: {e}"
        )

    return results
