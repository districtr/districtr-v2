import os
from urllib.parse import ParseResult
from core.settings import settings

import logging

LOGGER = logging.getLogger(__name__)


def download_file_from_s3(s3, url: ParseResult, replace=False) -> str:
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

    file_name = url.path.lstrip("/")
    LOGGER.debug("File name: %s", file_name)
    object_information = s3.head_object(Bucket=url.netloc, Key=file_name)
    LOGGER.debug("Object information: %s", object_information)

    if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
        raise ValueError(
            f"GeoPackage file {file_name} not found in S3 bucket {url.netloc}"
        )

    path = os.path.join(settings.OUT_SCRATCH, file_name)
    LOGGER.debug("Path: %s", path)

    if not os.path.exists(path) or replace:
        LOGGER.debug("Downloading file...")
        s3.download_file(url.netloc, file_name, path)

    return path
