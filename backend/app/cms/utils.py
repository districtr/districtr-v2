from fastapi import Depends, HTTPException, status, Security
from sqlmodel import Session, select
from sqlalchemy.exc import NoResultFound
from typing import Callable
from app.core.security import auth, TokenScope
from app.core.db import get_session
from app.cms.models import (
    CMS_MODEL_MAP,
    CmsContent,
    CmsContentCRUD,
)


def get_content_factory(
    scopes: list[str],
) -> Callable[[CmsContentCRUD, Session, dict], CmsContent]:
    """
    Factory function to create a content retrieval function with the given scopes.

    Args:
        scopes (list[str]): The scopes required to access the content.
    Returns:
        Callable: A function that retrieves content based on the provided data.
    """

    def _get_content_func(
        data: CmsContentCRUD,
        session: Session = Depends(get_session),
        auth_result: dict = Security(auth.verify, scopes=scopes),
    ) -> CmsContent:
        CMSModel: CmsContent = CMS_MODEL_MAP[data.content_type]
        try:
            assert isinstance(CMSModel, type), "Invalid content type"
            content = session.exec(
                select(CMSModel)
                .where(CMSModel.id == data.content_id)
                .where(CMSModel.author == auth_result["sub"])
            ).one()
        except NoResultFound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Content with ID '{data.content_id}' not found",
            )
        except AssertionError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid content type",
            )

        return content

    return _get_content_func


content_read = get_content_factory(scopes=[TokenScope.read_content])
content_update = get_content_factory(scopes=[TokenScope.update_content])
