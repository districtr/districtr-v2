from enum import Enum


class DocumentExportType(Enum):
    block_assignments_csv = "BlockAssignmentsCSV"
    districts_geojson = "DistrictsGeoJSON"
    districts_shapefile = "DistrictsShapefile"