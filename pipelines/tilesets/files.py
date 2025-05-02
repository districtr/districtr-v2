import os
import zipfile
from urllib.request import urlretrieve
from urllib.parse import urlparse, ParseResult
from pathlib import Path
from core.settings import settings

import logging

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)


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


def download_and_unzip_zipfile(zip_file_url: str, out_dir: Path | str) -> Path:
    """
    Download and unzip a file from a URL

    Args:
        zip_file_url (str): URL of the zip file to download

    Returns:
        str: Path to the unzipped file
    """
    if isinstance(out_dir, str):
        out_dir = Path(out_dir)

    if not out_dir.exists():
        out_dir.mkdir()

    file_name = urlparse(zip_file_url).path.split("/")[-1]
    zip_file = out_dir / file_name

    urlretrieve(zip_file_url, zip_file)

    with zipfile.ZipFile(zip_file, "r") as zip_ref:
        zip_ref.extractall(out_dir)

    return zip_file


def exists_in_s3(s3_client, bucket, key) -> bool:
    """
    Check if an object exists in an S3 bucket

    Args:
        s3_client: Boto3 S3 client
        bucket (str): S3 bucket name
        key (str): S3 object key

    Returns:
        bool: True if the object exists, False otherwise
    """
    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except Exception as e:
        if "404" in str(e):
            return False
        raise e
