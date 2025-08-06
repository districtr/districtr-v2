from fastapi import (
    APIRouter,
)
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(tags=["comments"], prefix="/api/comments")
