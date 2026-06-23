import os
from app.core.config import settings
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class UnsupportedFileScheme(Exception):
    pass


def remove_file(filename: str) -> None:
    """
    Remove a file, quietly warning of failure rather than raising an Error.

    Args:
        filename (str): The name of the file to remove.
    """
    try:
        os.remove(filename)
        logger.info(f"Removed file {filename}")
    except FileNotFoundError:
        logger.warning(f"File {filename} not found")
        pass


def file_exists(file_path) -> bool:
    """
    Check whether a thumbnail exists yet for this map document.

    Args:
        document_id: The ID for the map

    Returns:
        A true/false response if S3 returns head info.
    """
    url = urlparse(file_path)

    if url.scheme == "s3":
        bucket = url.netloc
        key = url.path.lstrip("/")
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        object_information = s3.head_object(
            Bucket=bucket,
            Key=key,
        )
        return object_information["ResponseMetadata"]["HTTPStatusCode"] == 200

    if url.scheme == "":
        return os.path.exists(file_path)

    raise UnsupportedFileScheme()
