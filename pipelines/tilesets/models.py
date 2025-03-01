from pydantic import BaseModel, computed_field
import json
import yaml
import os
import logging
from subprocess import run
from urllib.parse import urlparse
from typing import Iterable, TypeVar, Type

from settings import settings
from files import download_file_from_s3
from utils import merge_tilesets
from constants import S3_TILESETS_PREFIX

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

T = TypeVar("T")


def get_filetype(file_path: str) -> str:
    _, ext = os.path.splitext(file_path)
    return ext.lower()


class Config(BaseModel):
    name: str
    version: str | None

    @classmethod
    def from_file(cls: Type[T], file_path: str) -> T:
        """
        Load configuration from a file. Supports JSON and YAML formats.

        Args:
            file_path: Path to the configuration file.
        Returns:
            Config object.
        Raises:
            ValueError: If the file type is not supported.
        """
        file_type = get_filetype(file_path)
        if file_type == ".json":
            with open(file_path, "r") as f:
                data = json.load(f)
        elif file_type in (".yaml", ".yml"):
            with open(file_path, "r") as f:
                data = yaml.safe_load(f)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        return cls(**data)


class GerryDBTileset(BaseModel):
    gpkg: str
    layer_name: str
    new_layer_name: str | None
    columns: Iterable[str] = [
        "path",
        "geography",
        "total_pop",
    ]

    @computed_field
    @property
    def target_layer_name(self) -> str:
        return self.new_layer_name or self.layer_name

    def generate_tiles(self, replace: bool = False) -> str:
        """Generate GerryDB tileset.

        Args:
            replace: Whether to replace existing tiles.
        Returns:
            Path to the generated tileset.
        """
        logger.info("Creating GerryDB tileset...")
        s3 = settings.get_s3_client()

        url = urlparse(self.gpkg)
        logger.info("URL: %s", url)

        path = self.gpkg

        if url.scheme == "s3":
            assert s3, "S3 client is not available"
            path = download_file_from_s3(s3, url, replace)

        fbg_path = f"{settings.OUT_SCRATCH}/{self.layer_name}.fgb"
        logger.info("Creating flatgeobuf...")
        if os.path.exists(fbg_path) and not replace:
            logger.info("File already exists. Skipping creation.")
        else:
            result = run(
                args=[
                    "ogr2ogr",
                    "-f",
                    "FlatGeobuf",
                    "-select",
                    ",".join(self.columns),
                    "-t_srs",
                    "EPSG:4326",
                    "-nln",
                    self.target_layer_name,
                    fbg_path,
                    path,
                    self.layer_name,
                ]
            )

            if result.returncode != 0:
                logger.error("ogr2ogr failed. Got %s", result)
                raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

        logger.info("Creating tileset...")
        tileset_path = f"{settings.OUT_SCRATCH}/{self.layer_name}.pmtiles"

        if os.path.exists(tileset_path) and not replace:
            return tileset_path

        args = [
            "tippecanoe",
            "-z12",  # max zoom 12
            "-Z3",  # min zoom 3
            "-pS",  # at zoom 12, NO simplification
            "-M",  # max file size
            "1500000",  # 1.5 MiB max tile size. 500k is default
            "-O",  # max number of features
            "200000",  # 200,000 is default
            "--drop-smallest-as-needed",  # drop features
            "--extend-zooms-if-still-dropping",
            "-o",
            tileset_path,
            "-l",
            self.target_layer_name,
            fbg_path,
        ]
        if replace:
            args.append("--force")

        result = run(args=args)

        if result.returncode != 0:
            logger.error("tippecanoe failed. Got %s", result)
            raise ValueError(f"tippecanoe failed with return code {result.returncode}")

        return tileset_path


class TilesetBatch(Config):
    tilesets: dict[str, tuple[GerryDBTileset, GerryDBTileset | None]]
    _results: dict[str, str] = {}

    def add_result(self, layer_name: str, tile_path: str):
        self._results[layer_name] = tile_path

    def create_all(self, replace: bool = False, data_dir: str | None = None):
        for k, tilesets in self.tilesets.items():
            (parent_tileset, child_tileset) = tilesets

            if data_dir is not None:
                parent_tileset.gpkg = os.path.join(data_dir, parent_tileset.gpkg)
            out_parent_tiles = parent_tileset.generate_tiles(replace=replace)

            if not child_tileset:
                self.add_result(k, out_parent_tiles)
                continue

            logger.info(f"Generating tiles for parent-child layer {k}")

            if data_dir is not None:
                child_tileset.gpkg = os.path.join(data_dir, child_tileset.gpkg)
            out_child_tiles = child_tileset.generate_tiles(replace=replace)

            result = merge_tilesets(
                parent_layer=out_parent_tiles,
                child_layer=out_child_tiles,
                out_name=k,
            )
            self.add_result(k, result)

    def upload_results(self):
        logger.info("Uploading results to S3")
        for k, tile_path in self._results.items():
            s3_client = settings.get_s3_client()
            if not s3_client:
                raise ValueError("Failed to get S3 client")

            s3_key = f"{S3_TILESETS_PREFIX}/{k}.pmtiles"
            logger.info(f"Uploading {tile_path} to {s3_key}")
            s3_client.upload_file(tile_path, settings.S3_BUCKET, s3_key)

            logger.info(f"Uploaded {tile_path} to {s3_key}")
