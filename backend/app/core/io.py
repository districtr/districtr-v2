from urllib.parse import ParseResult
import os
from app.core.config import settings
from urllib.parse import urlparse
from pathlib import Path
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class UnsupportedFileScheme(Exception):
    pass


def download_file_from_s3(
    s3, url: ParseResult, out_path: str | None = None, replace=False
) -> str:
    """
    Download a file from S3 to the local volume path.

    Args:
        s3: S3 client
        url (ParseResult): URL of the file to download
        replace (bool): If True, replace the file if it already exists

    Returns the path to the downloaded file.
    """
    if not s3:
        raise ValueError("S3 client is not available")

    s3_prefix = url.path.lstrip("/")
    logger.info("File name: %s", s3_prefix)
    object_information = s3.head_object(Bucket=url.netloc, Key=s3_prefix)

    if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
        raise ValueError(f"File {s3_prefix} not found in S3 bucket {url.netloc}")

    logger.info("Downloading file from s3. Got response:\n%s", object_information)

    if not out_path:
        out_path = s3_prefix

    path = os.path.join(settings.VOLUME_PATH, out_path)
    logger.info("Path: %s", path)

    if os.path.exists(path) and not replace:
        logger.info("File already exists. Skipping download.")
    else:
        logger.info("Downloading file...")

        path_dir = Path(path).parent
        logger.info("Creating directory: %s", path_dir)
        path_dir.mkdir(parents=True, exist_ok=True)
        s3.download_file(url.netloc, s3_prefix, path)

    return path


def get_local_or_s3_path(file_path: str, replace: bool = False) -> str:
    """
    Get the local or S3 path for a file.

    Args:
        file_path (str): The path to the file.
        replace (bool): If True, replace the file if it already exists

    Returns the path to the downloaded file.
    """
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        return download_file_from_s3(s3=s3, url=url, replace=replace)

    return file_path


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
