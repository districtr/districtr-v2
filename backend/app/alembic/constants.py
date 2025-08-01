# The PostGIS alpine image includes a few extensions by default, which each
# come with their own set of tables
# https://hub.docker.com/r/postgis/postgis/
POST_GIS_ALPINE_RESERVED_TABLES = [
    "spatial_ref_sys",
    "bg",
    "direction_lookup",
    "countysub_lookup",
    "zip_lookup_all",
    "edges",
    "addrfeat",
    "layer",
    "addr",
    "cousub",
    "tabblock20",
    "secondary_unit_lookup",
    "pagc_lex",
    "state",
    "geocode_settings_default",
    "loader_variables",
    "loader_lookuptables",
    "topology",
    "place_lookup",
    "county",
    "place",
    "tabblock",
    "pagc_rules",
    "county_lookup",
    "street_type_lookup",
    "zip_state_loc",
    "zip_state",
    "pagc_gaz",
    "zip_lookup_base",
    "loader_platform",
    "geocode_settings",
    "featnames",
    "state_lookup",
    "tract",
    "zcta5",
    "zip_lookup",
    "faces",
]
