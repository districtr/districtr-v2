import os
import logging
from subprocess import run
from urllib.parse import urlparse

from core.settings import settings
from core.utils import download_file_from_s3


LOGGER = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def merge_tilesets(
    parent_layer: str, child_layer: str, out_name: str, replace: bool = False
) -> str:
    """
    Merge two tilesets.

    Args:
        parent_layer (str): The parent layer to merge.
        child_layer (str): The child layer to merge.
        replace (bool): Whether to replace the existing tileset.

    Returns:
        str: The path to the merged tileset.

    Raises:
        ValueError: If tippecanoe fails.
    """
    LOGGER.info("Merging GerryDB tilesets...")

    s3 = settings.get_s3_client()

    parent_url = urlparse(parent_layer)
    LOGGER.info("Parent URL: %s", parent_url)

    parent_path = parent_layer

    if parent_url.scheme == "s3":
        assert s3, "S3 client is not available"
        parent_path = download_file_from_s3(s3, parent_url, replace)

    child_url = urlparse(child_layer)
    LOGGER.info("Child URL: %s", child_url)

    child_path = child_layer

    if child_url.scheme == "s3":
        assert s3, "S3 client is not available"
        child_path = download_file_from_s3(s3, child_url, replace)

    out_path = f"{settings.OUT_SCRATCH}/{out_name}.pmtiles"

    if os.path.exists(out_path) and not replace:
        return out_path

    run(
        [
            "tile-join",
            "-o",
            out_path,
            parent_path,
            child_path,
            "--no-tile-size-limit",
            "--force",
        ]
    )

    LOGGER.info("Merging complete")
    return out_path
