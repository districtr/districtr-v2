from pydantic import BaseModel
import json
import yaml
import os
from typing import Type, TypeVar

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
