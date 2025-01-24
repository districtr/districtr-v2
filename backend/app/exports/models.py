from enum import Enum


class DocumentExportFormat(Enum):
    csv = "CSV"
    geojson = "GeoJSON"


class DocumentExportType(Enum):
    zone_assignments = "ZoneAssignments"
    block_zone_assignments = "BlockZoneAssignments"
    districts = "Districts"
