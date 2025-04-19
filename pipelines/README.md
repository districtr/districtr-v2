# Pipelines

Where data processing/ELT that can happen outside the API should go. Currently all pipelines are run locally.
This project does not presently necessitate an orchestrator or cloud infra beyond object storage.
Most Input datasets come from the gerrydb project.

Structure:

- `core`: Shared configuration and models
- `configs`: YAML configs for batch scripts
- `tilesets`: CLI for creating tilesets consumed by Districtr v2.
- `tabular`: Demography and other tabular data handling

## Quickstart

Using docker:

```sh
docker-compose run pipelines sh
```

From within the `pipelines` service, run commands:

```sh
python -m tilesets create-gerrydb-tileset ...
python -m tabular build-parquet ...
```

## Data format requirements

### Tabular

Tabular data is expected to be output as parquet files withthe following requirements:
- Parquet, long format with these columns: `path` (geoid), `column_name` (metric in that row), and `value`
- Compressed (default ZSTD level 12)
- Rows ordered by parent geography (VTD). The first rows must be 
- Key value metadata with the following information:
  - `column_list`: String list of all available columns in the long format
  - `length_list`: A dictionary of parent IDs and row ranges as an array `[number,number]`. Must include `parent`, which has the base parent data.


_Why long?_: Long format is much better for partial reads of the parquet, and with compression ends up a bit more efficient in transfer size
_Does it stay long format in browser?_: Nope! The queries and column derives are faster as wide. So, the parquert gets partially read using `hyparquet` on a WebWorker thread which rotates the data to a wide format.
_Doesn't this key-value metadata get chunky?_: A little. Texas, as an example of a big state, gets to be around 300kb. It's not ideal, but not terrible.