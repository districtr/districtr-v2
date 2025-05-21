import zipfile
from urllib.request import urlretrieve
from urllib.parse import urlparse
from pathlib import Path

import logging

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)


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
