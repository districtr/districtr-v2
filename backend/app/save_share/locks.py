from sqlalchemy import text
from sqlmodel import Session
import logging
from app.save_share.models import DocumentEditStatus

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def check_map_lock(
    document_id: str, user_id: str, session: Session
) -> DocumentEditStatus:
    # Try to fetch an existing lock for this document
    result = session.execute(
        text(
            """SELECT user_id FROM document.map_document_user_session
               WHERE document_id = :document_id
               LIMIT 1;"""
        ),
        {"document_id": document_id},
    ).fetchone()

    if result:
        # If a record exists, check if the current user is the one who locked it
        if result.user_id == user_id:
            return DocumentEditStatus.checked_out
        else:
            return DocumentEditStatus.locked

    # If no record exists, insert a new one and return checked_out
    session.execute(
        text(
            """INSERT INTO document.map_document_user_session (document_id, user_id)
               VALUES (:document_id, :user_id);"""
        ),
        {"document_id": document_id, "user_id": user_id},
    )
    session.commit()
    return DocumentEditStatus.checked_out


def cleanup_expired_locks(session: Session, hours: int) -> list[str] | None:
    """
    Delete expired locks from the database.

    Args:
        hours (int): The number of hours to keep locks.

    Returns:
        list[str]: A list of document IDs that had their locks deleted.

    Note:
    This feels like a DB concern and could be implemented with pg_cron.
    Did a brief spike trying to get pg_cron set up. Definitely a bit of a hassle
    so this will work for now.
    """
    stmt = text("DELETE FROM locks WHERE created_at < NOW() - INTERVAL :n_hours HOUR")
    try:
        stmt = text(
            """DELETE FROM document.map_document_user_session
            WHERE updated_at < NOW() - make_interval(hours => :n_hours)
            RETURNING document_id"""
        )

        result = session.execute(stmt, {"n_hours": hours}).scalars()
        locks = list(result)
        session.commit()
        logger.info(
            f"Deleted {len(locks)} expired locks: [{' '.join(map(str, locks))}]"
        )
        return locks
    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting expired locks: {e}")


def remove_all_locks(session: Session) -> list[str] | None:
    """
    Delete all locks from the database.

    Args:
        session (Session): The database session.

    Returns:
        list[str]: A list of document IDs that had their locks deleted.
    """
    stmt = text("DELETE FROM locks")
    try:
        stmt = text(
            """DELETE FROM document.map_document_user_session
            RETURNING document_id"""
        )

        result = session.execute(stmt).scalars()
        locks = list(result)
        session.commit()
        logger.info(f"Deleted {len(locks)} locks: [{' '.join(map(str, locks))}]")
        return locks
    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting all locks: {e}")
