/**
 * Denotes boundary information, might be specific to geojson format
 */
interface boundary {
  id: string;
  label: string;
  path: string;
  centroids?: boolean;
  namefield?: string;
  lineColor?: string;
  fill?: boolean | string;
  fill_alt?: string | boolean;
  lineWidth?: number;
  problemName?: string;
  unitType?: string;
}

/**
 * Presumably this links to Mapbox tileset sources
 * @see What {@link https://docs.mapbox.com/mapbox-tiling-service/guides/tileset-sources/}
 */
interface tileset {
  source: {
    type: string;
    url: string;
  };
  type: string;
  sourceLayer: string;
  clusterLayer: boolean;
}

/**
 * Not sure what exactly this is referring to.
 */
interface coiData {
  tilesets: tileset[];
  clusterKey: string;
  clusterData: { url: string };
}

/**
 * Links to redistricting board forms.
 * @param {string} endpoint denotes the url of the redistricting website.
 * @param {string} saveredirect denotes a url to a form (might need to deprecate)
 * @see Example {@link https://www.akredistrict.org/map-comment}
 */
interface portal {
  endpoint: string;
  saveredirect?: string;
}

/**
 * Also not sure what this is referring to.
 */
type countyFilter = string | countyFilter[];

/**
 * Contains all spatial properties for a given state.
 */
interface spatialPropertiesObject {
  native_american?: boolean;
  number_markers?: boolean;
  county_brush?: boolean;
  shapefile?: boolean;
  find_unpainted?: boolean;
  contiguity?: number | boolean;
  school_districts?: boolean;
  municipalities?: boolean | string;
  current_districts?: boolean | string;
  boundaries?: boundary[];
  portal?: portal;
  coalition?: boolean;
  border?: boolean;
  sideload?: boolean;
  purple_demo?: boolean;
  load_coi?: boolean;
  neighborhood_borders?: boolean | string;
  multiyear?: number;
  parties?: string[];
  neighborhoods?: boolean;
  vra_effectiveness?: boolean;
  coi?: coiData;
  block_assign?: boolean;
  election_history?: boolean;
  coi2?: boolean;
  county_filter?: countyFilter;
}

/**
 * Maps state name to its spatial properties.
 * @type {Object}
 * @param {string} stateName
 * @param {spatialPropertiesObject} properties - An object with properties describing various spatial attributes.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */
export const stateSpatialAttributes: {
  [stateName: string]: spatialPropertiesObject;
} = {
  alabama: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    contiguity: true,
  },
  alaska: {
    number_markers: true,
    native_american: true,
    shapefile: true,
    school_districts: true,
    municipalities: true,
    current_districts: true,
    boundaries: [
      {
        id: "2021_plan",
        label: "2021 Proclamation Plan",
        path: "current_districts/alaska/2021_plan",
      },
    ],
    portal: {
      endpoint: "https://www.akredistrict.org/map-comment",
    },
  },
  alaska_blocks: {
    coalition: false,
    school_districts: true,
    municipalities: true,
    current_districts: true,
    portal: {
      endpoint: "https://www.akredistrict.org/map-comment",
      saveredirect: "www.akredistrict.org/create/edit.html",
    },
  },
  arizona: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    // find_unpainted: true,
  },
  maricopa: {
    native_american: true,
    number_markers: true,
  },
  nwaz: {
    native_american: true,
    number_markers: true,
  },
  seaz: {
    native_american: true,
    number_markers: true,
  },
  mesaaz: {
    native_american: true,
    number_markers: true,
    border: true,
    sideload: true,
  },
  glendaleaz: {
    border: true,
    number_markers: true,
    shapefile: true,
    coalition: false,
    boundaries: [
      {
        id: "districts",
        label: "Current Districts",
        path: "current_districts/arizona/glendaleaz",
        centroids: true,
      },
    ],
  },
  phoenix: {
    native_american: true,
    number_markers: true,
    border: true,
  },
  yuma: {
    native_american: true,
    number_markers: true,
    border: true,
    shapefile: true,
    find_unpainted: true,
    boundaries: [
      {
        id: "districts",
        label: "Current Districts",
        path: "current_districts/arizona/yuma",
        centroids: true,
      },
    ],
  },
  yuma_awc: {
    native_american: true,
    number_markers: true,
    border: true,
    shapefile: true,
    find_unpainted: true,
    boundaries: [
      {
        id: "districts",
        label: "Current Districts",
        path: "current_districts/arizona/yuma_awc",
        centroids: true,
      },
    ],
  },
  arkansas: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  california: {
    number_markers: true,
    native_american: true,
    county_brush: true,
    shapefile: true,
    sideload: true,
    // find_unpainted: true,
  },
  lagunaniguel: {
    number_markers: true,
    shapefile: true,
    border: true,
  },
  actransit: {
    number_markers: true,
    shapefile: true,
    border: true,
    boundaries: [
      {
        id: "places",
        label: "Census Places",
        path: "actransit/places",
        centroids: true,
        namefield: "Place",
        lineColor: "darkgreen",
      },
    ],
  },
  belmontredwood: {
    number_markers: true,
    shapefile: true,
    border: true,
    boundaries: [
      {
        id: "neighborhood",
        label: "Neighborhoods",
        path: "belmont/neighborhoods",
        centroids: true,
        namefield: "HOA_BNDRY",
        lineColor: "darkgreen",
      },
    ],
  },
  ca_SanDiego: {
    number_markers: true,
    shapefile: true,
    border: true,
    purple_demo: true,
    boundaries: [
      {
        id: "districts",
        label: "Current City Council Districts (2011)",
        path: "current_districts/california/ca_SanDiego",
        lineColor: "orangered",
      },
      {
        id: "neighborhood",
        label: "Community Planning Group Areas",
        path: "neighborhoods/california/ca_SanDiego",
        centroids: true,
        lineColor: "darkgreen",
      },
      {
        id: "pbeats", // aka police beats
        label: "Neighborhood Areas",
        path: "neighborhoods/california/ca_SanDiego_beats",
        centroids: true,
        lineColor: "darkblue",
      },
      {
        id: "schools",
        label: "School Districts",
        path: "school_districts/california/ca_SanDiego",
        centroids: true,
        fill: true,
        fill_alt: true,
      },
    ],
    portal: {
      endpoint: "https://portal.sandiego-mapping.org",
    },
  },
  livermore: {
    number_markers: true,
    border: true,
    shapefile: true,
    coalition: false,
  },
  ca_contracosta: {
    number_markers: true,
    border: true,
    shapefile: true,
    school_districts: true,
    municipalities: true,
    current_districts: true,
    boundaries: [
      {
        id: "contracosta_cdp",
        label: "Census Designated Places",
        path: "ca_contracosta_cdp",
      },
    ],
    portal: {
      endpoint: "https://portal.contracosta-mapping.org",
    },
  },
  ca_sutter: {
    number_markers: true,
    border: true,
    shapefile: true,
    municipalities: true,
    current_districts: true,
    boundaries: [
      {
        id: "precincts",
        label: "Current Precincts",
        path: "current_districts/california/ca_sutter_precincts",
      },
    ],
  },
  ftmyers: {
    number_markers: true,
    border: true,
    shapefile: true,
    find_unpainted: true,
  },
  contracosta: {
    number_markers: true,
    border: true,
    shapefile: true,
    municipalities: true,
    portal: {
      endpoint: "https://portal.contracosta-mapping.org",
    },
  },
  pasorobles: {
    number_markers: true,
    border: true,
    shapefile: true,
  },
  sacramento: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: true,
    // divisor: 1000,
  },
  "29palms": {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: true,
  },
  yuba_city: {
    coalition: false,
    shapefile: false,
    number_markers: true,
    border: true,
    sideload: false,
  },
  buena_park: {
    coalition: false,
    shapefile: false,
    number_markers: true,
    border: true,
    sideload: false,
  },
  modesto: {
    coalition: false,
    shapefile: false,
    number_markers: true,
    border: true,
    sideload: false,
  },
  sbusd_5: {
    coalition: false,
    shapefile: false,
    number_markers: true,
    border: true,
    sideload: false,
    boundaries: [
      {
        id: "sbusd_feeder",
        label: "Elementary School Attendance Boundaries",
        path: "school_districts/california/sbusd-feeder-districts",
        lineColor: "black",
      },
      {
        id: "sbusd",
        label: "Cities and Towns",
        path: "municipalities/california/sbusd-municipalities",
        lineColor: "black",
      },
    ],
  },
  sbusd_7: {
    coalition: false,
    shapefile: false,
    number_markers: true,
    border: true,
    sideload: false,
    boundaries: [
      {
        id: "sbusd_feeder",
        label: "Elementary School Attendance Boundaries",
        path: "school_districts/california/sbusd-feeder-districts",
        lineColor: "black",
      },
      {
        id: "sbusd",
        label: "Cities and Towns",
        path: "municipalities/california/sbusd-municipalities",
        lineColor: "black",
      },
    ],
  },
  navajoco: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: "Supervisorial Districts",
    boundaries: [],
  },
  san_dimas: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
  },
  marinco: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    current_districts: "Marin County",
    boundaries: [
      {
        path: "municipalities/california/marinco",
        id: "cities_towns",
        label: "Cities and Towns",
        centroids: false,
        fill: false,
      },
      {
        path: "school_districts/california/marinco",
        id: "school_districts",
        label: "School Districts",
        centroids: false,
        fill: false,
      },
    ],
  },
  oxnarduhsd: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    boundaries: [
      {
        path: "school_districts/california/oxnarduhsd_elementary",
        id: "elementary_schools",
        label: "Elementary School Attendance Boundaries",
        centroids: false,
        fill: false,
      },
      {
        path: "municipalities/california/oxnarduhsd",
        id: "cities_towns",
        label: "Cities and Towns",
        centroids: false,
        fill: false,
      },
    ],
  },
  anaheim: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: true,
  },
  arcadia: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: true,
  },
  la_mirada: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: true,
  },
  lakewood: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
  },
  stlouis: {
    shapefile: true,
    number_markers: true,
    border: true,
  },
  placentia: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
    current_districts: true,
  },
  san_bruno: {
    coalition: false,
    shapefile: true,
    number_markers: true,
    border: true,
    sideload: false,
  },
  ca_sonoma: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  sunnyvale: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  laverne: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  pomona: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_richmond: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  elcajon: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_carlsbad: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  encinitas: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  buenapark: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  halfmoon: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_stockton: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  lodi: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_pasadena: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_goleta: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_glendora: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_santabarbara: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_fresno: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_fresno_ci: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_nevada: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_merced: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_kings: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  lake_el: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_chino: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_campbell: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_fremont: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_buellton: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_vallejo: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_grover: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_oceano: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_sm_county: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  sbusd: {
    coalition: false,
    border: true,
    number_markers: true,
    school_districts: true,
    municipalities: true,
  },
  pvsd: {
    coalition: false,
    border: true,
    number_markers: true,
    load_coi: true,
    boundaries: [
      {
        id: "es_boundary",
        label: "Elementary School Attendance Boundaries",
        path: "school_districts/california/pvsd_feeder",
        lineColor: "black",
      },
      {
        id: "citycouncil",
        label: "Camarillo City Council Districts (2010)",
        path: "current_districts/california/camarillo_city_council",
        lineColor: "black",
      },
      {
        id: "places",
        label: "Census Places",
        path: "neighborhoods/california/camarillo_places",
        lineColor: "black",
      },
    ],
  },
  ca_sanbenito: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_marin: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_watsonville: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_marina: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_arroyo: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_cvista: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_camarillo: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  ca_bellflower: {
    coalition: false,
    border: true,
    shapefile: true,
    number_markers: true,
    current_districts: true,
  },
  napa2021: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
  },
  napacounty2021: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
    municipalities: true,
  },
  ca_tuolumne: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  napa_boe: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  napa_college: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  santa_clara_h2o: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  santarosa: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: false,
    coalition: false,
    current_districts: true,
  },
  ca_sanmateo: {
    number_markers: true,
    // contiguity: 2,
    border: true,
    shapefile: true,
    neighborhood_borders: "Neighborhoods",
  },
  ca_santa_ana: {
    number_markers: true,
    border: true,
    shapefile: true,
  },
  ca_kern: {
    number_markers: true,
    border: true,
    // contiguity: 2,
    shapefile: true,
    municipalities: true,
  },
  ca_poway: {
    coalition: false,
    number_markers: true,
  },
  ca_torrance: {
    coalition: false,
    number_markers: true,
  },
  menlo_park: {
    border: true,
    find_unpainted: true,
    boundaries: [
      {
        id: "schools",
        label: "School Districts",
        path: "school_districts/california/menlo_park",
        centroids: true,
        fill: true,
        fill_alt: "orange",
      },
      {
        id: "neighborhood",
        label: "Neighborhoods",
        path: "neighborhoods/california/menlo_park",
        centroids: true,
        fill: true,
        fill_alt: true,
      },
      {
        id: "flooded",
        label: "Flood Zone",
        path: "menlo_park_floodzone",
        fill: "#8090c2",
      },
      {
        id: "menloh2o",
        label: "California Water Service",
        path: "menlo_park_water",
        fill: "#c6dbef",
        // centroids: true,
      },
      {
        id: "menloh2o2",
        label: "East Palo Alto Water District",
        path: "menlo_park_water2",
        fill: "#9ecae1",
        // centroids: true,
      },
      {
        id: "menloh2o5",
        label: "Palo Alto Park Water District",
        path: "menlo_park_water5",
        fill: "#6baed6",
        // centroids: true,
      },
      {
        id: "menloh2o3",
        label: "Menlo Park Water District",
        path: "menlo_park_water3",
        fill: "#3182bd",
        // centroids: true,
      },
      {
        id: "menloh2o4",
        label: "O’Connor Water District",
        path: "menlo_park_water4",
        fill: "#08519c",
        // centroids: true,
      },
      {
        id: "menlomulti",
        label: "Multi-Family Parcels",
        path: "menlo_park_multifamily",
      },
    ],
  },
  ca_imperial: {
    number_markers: true,
    border: true,
    shapefile: true,
    municipalities: "Census Places",
    find_unpainted: true,
  },
  ojai: {
    number_markers: true,
    border: true,
    shapefile: true,
    find_unpainted: true,
  },
  ca_foothill: {
    number_markers: true,
    border: true,
    shapefile: true,
    find_unpainted: true,
  },
  ca_sanjoaquin: {
    number_markers: true,
    border: true,
    shapefile: true,
    municipalities: true,
    boundaries: [
      {
        id: "bg_gj",
        label: "Block Groups",
        path: "ca_sanjoaquin_bg",
      },
      {
        id: "tract_gj",
        label: "Tracts",
        path: "ca_sanjoaquin_tract",
        centroids: true,
      },
    ],
  },
  rp_lax: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
    coalition: false,
    current_districts: "Current Council Districts",
    boundaries: [
      {
        id: "latimes_places",
        label: "LA Times Neighborhoods",
        path: "neighborhoods/lax_LATimes_Neighborhood",
        centroids: true,
      },
      {
        id: "ncouncil_places",
        label: "Neighborhood Councils",
        path: "neighborhoods/lax_neighborhood_council",
        centroids: true,
      },
    ],
  },
  ca_butte: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
    municipalities: "Census Designated Places",
    current_districts: true,
    native_american: true,
    boundaries: [
      {
        id: "greenline",
        label: "Greenline",
        path: "ca_butte_greenline",
        lineColor: "#070",
        lineWidth: 2.5,
      },
    ],
  },
  ca_humboldt: {
    border: true,
    shapefile: true,
    // contiguity: 2,
    number_markers: true,
    municipalities: true,
    sideload: true,
    native_american: true,
  },
  ca_oakland: {
    border: true,
    shapefile: true,
    number_markers: true,
    find_unpainted: true,
  },
  ca_martinez: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
  },
  carpinteria: {
    border: true,
    shapefile: true,
    number_markers: true,
  },
  ca_brentwood: {
    border: true,
    shapefile: true,
    number_markers: true,
    coalition: false,
  },
  ca_riverside: {
    border: true,
    shapefile: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "council_districts",
        label: "Current Wards (enacted 2012)",
        path: "current_districts/california/ca_riverside",
      },
      {
        id: "neighborhood",
        label: "Neighborhoods",
        path: "neighborhoods/california/ca_riverside",
        namefield: "Neighborho",
        centroids: true,
      },
    ],
  },
  ca_rohnert: {
    border: true,
    shapefile: true,
    number_markers: true,
    coalition: false,
  },
  ca_millbrae: {
    border: true,
    number_markers: true,
    coalition: false,
  },
  ca_belmont: {
    border: true,
    number_markers: true,
    coalition: false,
  },
  ca_elkgrove: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "council_districts",
        label: "City Council Districts (enacted 2011)",
        path: "ca_elkgrove/city_council_districts",
      },
      {
        id: "city_limits_census_day_2020",
        label: "City Limits before Census Day 2020",
        path: "ca_elkgrove/city_limits_census_day_2020",
      },
      {
        id: "special_planning_areas",
        label: "Special Planning Areas",
        path: "ca_elkgrove/special_planning_areas",
      },
    ],
  },
  az_pima: {
    border: true,
    number_markers: true,
    coalition: true,
    native_american: true,
    shapefile: true,
    boundaries: [
      {
        id: "current_supervisor_dists",
        label: "Current Supervisor/P.C.C. Districts",
        path: "az_pima/current_supervisor_dists",
      },
      {
        id: "incorp_jurisdictions",
        label: "Incorporated Jurisdictions",
        path: "az_pima/incorp_jurisdictions",
      },
      {
        id: "incumbent_precincts",
        label:
          "Voter Precincts Containing Incumbent Elected Official’s Residence",
        path: "az_pima/incumbent_precincts",
      },
      {
        id: "school_districts",
        label: "School Districts",
        centroids: true,
        namefield: "SDISTNAME",
        path: "az_pima/school_districts",
      },
    ],
  },
  az_maricopa: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "school",
        label: "School Districts",
        path: "az_maricopa/school",
      },
      {
        id: "congressional",
        label: "Congressional Districts",
        path: "az_maricopa/congressional",
      },
      {
        id: "legislative",
        label: "Legislative Districts",
        path: "az_maricopa/legislative",
      },
      {
        id: "current",
        label: "Current Districts",
        path: "az_maricopa/current",
      },
      {
        id: "cities",
        label: "Cities",
        centroids: true,
        namefield: "Juris",
        path: "az_maricopa/cities",
      },
    ],
  },
  sanjoseca: {
    border: true,
    shapefile: true,
    number_markers: true,
    boundaries: [
      {
        id: "sj_places",
        label: "Neighborhoods",
        path: "neighborhoods/sanjose_neighborhoods",
        centroids: true,
      },
    ],
  },
  ca_scvosa: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "fee_title",
        label: "Protected Lands: Fee Title",
        path: "ca_scvosa/fee_title",
      },
      {
        id: "conservation_easement",
        label: "Protected Lands: Conservation Easements",
        path: "ca_scvosa/conservation_easement",
      },
      {
        id: "schools",
        label: "K-12 Schools",
        path: "ca_scvosa/schools",
        centroids: true,
        namefield: "School",
      },
      {
        id: "census_places",
        label: "Census Places",
        path: "ca_scvosa/census_places",
        centroids: true,
      },
    ],
  },
  ca_west_sac: {
    border: true,
    number_markers: true,
    coalition: false,
  },
  ca_diamond_bar: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "parks",
        label: "Parks",
        centroids: true,
        namefield: "NAME",
        path: "ca_diamond_bar/parks",
      },
      {
        id: "school_districts",
        label: "School Districts",
        centroids: true,
        namefield: "NAME",
        path: "ca_diamond_bar/school_districts",
        lineWidth: 0.5,
      },
    ],
  },
  ca_fpud: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "current_divisions",
        label: "Current Divisions",
        path: "ca_fpud/current_divisions",
      },
    ],
  },
  indianapolis_cc: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "neighborhoods",
        label: "Neighborhoods",
        path: "indianapolis_cc/neighborhoods",
        centroids: true,
        namefield: "NAME",
      },
      {
        id: "cities_and_towns",
        label: "Cities and Towns",
        path: "indianapolis_cc/cities_and_towns",
        centroids: true,
        namefield: "CITYNAME",
      },
    ],
  },
  valparaiso: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        id: "districts",
        label: "Current Districts",
        path: "valparaiso/districts",
        lineColor: "#80231c",
        lineWidth: 2.5,
      },
      {
        id: "precincts",
        label: "County Precincts",
        path: "valparaiso/precincts",
        lineColor: "#227B22",
        lineWidth: 2,
      },
    ],
  },
  gary: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        id: "districts",
        label: "Current Districts",
        path: "gary/districts",
        lineColor: "#80231c",
        lineWidth: 2.5,
      },
      {
        id: "precincts",
        label: "Precincts",
        path: "gary/precincts",
        lineColor: "#227B22",
        lineWidth: 2,
      },
    ],
  },
  nm_abq: {
    border: true,
    number_markers: true,
    coalition: false,
    boundaries: [
      {
        id: "current_districts",
        label: "City Council Districts (enacted 2011)",
        path: "nm_abq/current_districts",
      },
      {
        id: "incumbents",
        label: `Current City Councilor Locations`,
        path: "nm_abq/incumbents",
        centroids: true,
        namefield: "Name",
      },
    ],
  },
  redwood: {
    border: true,
    shapefile: true,
    number_markers: true,
    // contiguity: 2,
    current_districts: true,
    school_districts: true,
    neighborhood_borders: true,
  },
  ca_ventura: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  ca_yolo: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  longbeach: {
    border: true,
    shapefile: true,
    number_markers: true,
    find_unpainted: true,
    current_districts: true,
  },
  ca_solano: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  ca_sc_county: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  ca_siskiyou: {
    border: true,
    shapefile: true,
    number_markers: true,
    municipalities: true,
  },
  sanluiso: {
    coalition: false,
    number_markers: true,
    // contiguity: 2,
    shapefile: true,
    border: true,
    municipalities: true,
    // sideload: true,
  },
  ccsanitation: {
    shapefile: true,
  },
  ccsanitation2: {
    shapefile: true,
    border: true,
    current_districts: true,
    number_markers: true,
  },
  santa_clara: {
    border: true,
  },
  napa: {
    number_markers: true,
    border: true,
  },
  napaschools: {
    number_markers: true,
    coalition: false,
    border: true,
  },
  chicago: {
    number_markers: true,
    multiyear: 2019,
    border: true,
    parties: [
      "Rahm Emanuel",
      "Jesus \u201cChuy\u201d Garc\u00eda",
      "Lori Lightfoot",
      "Toni Preckwinkle",
    ],
  },
  colorado: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
    load_coi: false,
  },
  jeffersoncoco: {
    number_markers: true,
    border: true,
    shapefile: true,
  },
  connecticut: {
    county_brush: true,
    native_american: true,
    number_markers: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
    load_coi: false,
  },
  dc: {
    number_markers: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  delaware: {
    number_markers: true,
    native_american: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  florida: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    sideload: true,
    portal: {
      endpoint: "https://portal.florida-mapping.org",
    },
  },
  miamifl: {
    number_markers: true,
    border: true,
    shapefile: true,
    boundaries: [
      {
        id: "current_districts",
        label: "Current Districts",
        path: "miami/Miami_City_District",
      },
      {
        id: "neighborhoods2",
        label: `Neighborhoods`,
        path: "miami/neighborhoods",
        centroids: true,
        namefield: "Mel_Hood",
      },
      {
        id: "neighborhoods",
        label: `City of Miami Planning Areas`,
        path: "miami/Miami_Neighborhoods_Shapefile",
        centroids: true,
        namefield: "LABEL",
      },
      {
        id: "historic_districts",
        label: "Historic Districts",
        path: "miami/Historic_Districts",
        centroids: true,
        namefield: "HD_NAME",
      },
      {
        id: "revitalization",
        label: "Neighborhood Revitalization Districts",
        path: "miami/Neighborhood_Revitalization_District",
      },
    ],
  },
  miamidade: {
    number_markers: true,
    neighborhoods: true,
    boundaries: [
      {
        path: "city_border/miamifl",
        id: "citybor",
        label: "Show City Border",
      },
    ],
  },
  fl_hills: {
    number_markers: true,
    shapefile: true,
  },
  fl_orange: {
    number_markers: true,
    shapefile: true,
  },
  fl_osceola: {
    number_markers: true,
    shapefile: true,
  },
  orlando: {
    number_markers: true,
    shapefile: true,
    border: true,
  },
  tampa: {
    number_markers: true,
    shapefile: true,
    border: true,
  },
  kissimmee: {
    number_markers: true,
    shapefile: true,
  },
  georgia: {
    number_markers: true,
    county_brush: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  hawaii: {
    number_markers: true,
    native_american: true,
    county_brush: true,
    shapefile: true,
  },
  idaho: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    contiguity: 2,
    find_unpainted: true,
  },
  illinois: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  indiana: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    school_districts: true,
    current_districts: true,
    municipalities: "Cities and Towns",
    portal: {
      endpoint: "https://portal.indiana-mapping.org",
    },
  },
  iowa: {
    number_markers: true,
    contiguity: 2,
    shapefile: true,
    // find_unpainted: true,
  },
  kansas: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  kentucky: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  lax: {
    neighborhoods: true,
    number_markers: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
    boundaries: [
      {
        id: "va2010",
        label: "State Assembly",
        path: "lax_2010",
      },
      {
        id: "va2013",
        label: "State Senate",
        path: "lax_senate",
      },
      {
        id: "lax_ush",
        label: "US House",
        path: "lax_congress",
      },
    ],
  },
  little_rock: {
    number_markers: true,
  },
  louisiana: {
    native_american: true,
    county_brush: true, // lakes
    number_markers: true, // fetch is failing?
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
    load_coi: false,
  },
  la_vra: {
    native_american: true,
    vra_effectiveness: true,
    county_brush: true, // lakes
    number_markers: true,
  },
  batonrouge: {
    number_markers: true,
    shapefile: true,
    border: true,
    // find_unpainted: true, COI only
  },
  maine: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    find_unpainted: true,
  },
  maryland: {
    number_markers: true,
    county_brush: true,
    // absentee: true,
    shapefile: true,
    find_unpainted: true,
    load_coi: false,
  },
  baltimore: {
    border: true,
    number_markers: true,
    shapefile: true,
    contiguity: 2,
    boundaries: [
      {
        id: "cityprec",
        label: "Voter Precincts",
        path: "baltimore-precincts",
      },
    ],
  },
  ma: {
    number_markers: true,
    shapefile: true,
    // find_unpainted: true,
    portal: {
      endpoint: "https://www.massachusetts-mapping.org",
    },
  },
  ma_vra: {
    number_markers: true,
    vra_effectiveness: true,
    // shapefile: true,
    // find_unpainted: true,
  },
  ma_vra2: {
    number_markers: true,
    // vra_effectiveness: true,
    // shapefile: true,
    // find_unpainted: true,
  },
  boston22: {
    number_markers: true,
    shapefile: true,
    border: true,
    boundaries: [
      {
        id: "council",
        label: "Current Districts",
        path: "boston-council",
        namefield: "DISTRICT",
        centroids: true,
        lineColor: "#007",
        lineWidth: 2,
      },
      {
        id: "precincts",
        label: "Precinct Names",
        path: "boston-precincts",
        namefield: "DISTRICT",
        centroids: true,
      },
    ],
  },
  lowell: {
    neighborhoods: true,
    contiguity: 2,
    number_markers: true,
    shapefile: true,
    coalition: false,
    border: true,
    // find_unpainted: true,
  },
  ma_worcester_fix: {
    number_markers: true,
    coalition: false,
    border: true,
    shapefile: true,
    boundaries: [
      {
        id: "city_council",
        label: "City Council Districts",
        path: "ma_worcester/city_council",
      },
      {
        id: "wards",
        label: "Wards (2020)",
        path: "ma_worcester/worcester-wards",
      },
      {
        id: "voting_precincts",
        label: "Voting Precincts (2020)",
        path: "ma_worcester/worcester-precincts",
      },
    ],
  },
  in_bloomington: {
    number_markers: true,
    coalition: false,
    border: true,
  },
  massachusetts: {
    portal: {
      endpoint: "https://www.massachusetts-mapping.org",
    },
  },
  michigan: {
    load_coi: true,
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.michigan_bg_clusters",
          },
          type: "fill",
          sourceLayer: "michigan_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/MI/clusters.json",
      },
    },
    number_markers: true,
    native_american: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    current_districts: true,
    school_districts: true,
    municipalities: true,
    contiguity: 2,
    portal: {
      endpoint: "https://www.michigan-mapping.org",
    },
  },
  minnesota: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
  },
  mn2020acs: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
  },
  olmsted: {
    number_markers: true,
    border: true,
    boundaries: [
      {
        path: "city_border/rochestermn",
        id: "citybor",
        label: "Show Rochester Border",
      },
    ],
  },
  rochestermn: {
    number_markers: true,
    border: true,
  },
  washington_mn: {
    border: true,
    number_markers: true,
    shapefile: true,
  },
  stlouis_mn: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        path: "city_border/duluth",
        id: "citybor",
        label: "Show Duluth Border",
      },
    ],
  },
  minneapolis: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        id: "minn_wards",
        label: "Current City Council Wards",
        path: "current_districts/minnesota/city_council/minneapolis",
        centroids: true,
      },
      {
        id: "minn_park_dists",
        label: "Current Park Districts",
        path: "current_districts/minnesota/park_districts/minneapolis",
        centroids: true,
      },
      {
        id: "minn_neighborhoods",
        label: "Neighborhoods",
        path: "neighborhoods/minnesota/minneapolis",
        centroids: true,
      },
    ],
    portal: {
      endpoint: "https://portal.minneapolis-mapping.org",
    },
  },
  mississippi: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  missouri: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    load_coi: false,
    // find_unpainted: true,
    school_districts: true,
    contiguity: 2,
    portal: {
      endpoint: "https://portal.missouri-mapping.org",
    },
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.missouri_bg_clusters",
          },
          type: "fill",
          sourceLayer: "missouri_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/MO/clusters.json",
      },
    },
  },
  montana: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    find_unpainted: true,
    county_brush: true,
  },
  mt_pris_adj: {
    native_american: true,
    number_markers: true,
    // shapefile: true,
  },
  nebraska: {
    number_markers: true,
    native_american: true,
    county_brush: true,
    // absentee: true,
    shapefile: true,
    load_coi: false,
    // find_unpainted: true,
  },
  nevada: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    contiguity: 2,
  },
  reno: {
    number_markers: true,
    shapefile: true,
    border: true,
    boundaries: [
      {
        id: "ward",
        label: "City Ward Districts (2021)",
        path: "reno/wards",
        lineColor: "orangered",
        lineWidth: 1.25,
      },
      {
        id: "neighborhood",
        label: "Neighborhoods",
        path: "reno/neighborhoods",
        centroids: true,
        namefield: "NAME",
        lineWidth: 0.75,
        lineColor: "darkgreen",
      },
      {
        id: "bid",
        label: "Business Improvement District",
        path: "reno/bid",
      },
      {
        id: "spd",
        label: "Special Planning Districts",
        path: "reno/spd",
      },
      {
        id: "schools",
        label: "Elementary School Districts",
        path: "reno/elementary",
        centroids: true,
        namefield: "NAME",
        lineColor: "darkblue",
      },
      {
        id: "schools2",
        label: "Middle School Districts",
        path: "reno/middle",
        centroids: true,
        namefield: "NAME",
        lineColor: "darkblue",
      },
      {
        id: "schools3",
        label: "High School Districts",
        path: "reno/high",
        centroids: true,
        namefield: "NAME",
        lineColor: "darkblue",
      },
    ],
  },
  newhampshire: {
    number_markers: true,
    shapefile: true,
    // find_unpainted: true,
    school_districts: true,
  },
  newjersey: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    contiguity: 2,
  },
  new_mexico: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    contiguity: 2,
    current_districts: true,
    shapefile: true,
    find_unpainted: true,
    block_assign: true,
  },
  new_mexico_portal: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    contiguity: 2,
    current_districts: true,
    shapefile: true,
    find_unpainted: true,
    election_history: false,
    block_assign: true,
    portal: {
      endpoint: "https://portal.newmexico-mapping.org",
    },
  },
  new_mexico_bg: {
    native_american: true,
    shapefile: true,
    current_districts: true,
    county_brush: true,
    // find_unpainted: true,
    portal: {
      endpoint: "https://portal.newmexico-mapping.org",
    },
  },
  santafe: {
    number_markers: true,
    contiguity: 2,
    shapefile: true,
    // find_unpainted: true,
  },
  newyork: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    // find_unpainted: true,
    boundaries: [
      {
        id: "nyirc_assembly_plan",
        label: "NYIRC Draft Assembly Plan",
        path: "nyirc_assembly/nyirc_assembly_plan",
        centroids: false,
        problemName: "State Assembly",
      },
    ],
  },
  nyc_popdemo: {
    number_markers: true,
    shapefile: true,
    coalition: true,
    sideload: true,
    boundaries: [
      {
        id: "nyc_district",
        label: "City Council Districts (2012)",
        path: "current_districts/nyc/city_council",
        centroids: false,
        lineColor: "#007",
      },
      {
        id: "nyc_comm",
        label:
          "Community Boards link:https://communityprofiles.planning.nyc.gov/",
        path: "current_districts/nyc/community",
        centroids: false,
        lineColor: "#700",
      },
      {
        id: "nyc_boro",
        label: "Boroughs",
        path: "current_districts/nyc/boroughs",
        centroids: false,
      },
    ],
  },
  northcarolina: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    coi2: true,
    current_districts: true,
    shapefile: true,
    find_unpainted: true,
    coalition: false,
  },
  forsyth_nc: {
    contiguity: 2,
    shapefile: true,
    boundaries: [
      {
        id: "citybor",
        label: "Show Winston-Salem Border",
        path: "forsyth_nc_muni",
      },
    ],
  },
  buncombe: {
    contiguity: 2,
    shapefile: true,
    number_markers: true,
    border: true,
    boundaries: [
      {
        path: "city_border/asheville",
        id: "citybor",
        label: "Show Asheville Border",
      },
    ],
  },
  northdakota: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  nd_benson: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38005"],
      ["<", ["get", "GEOID20"], "38006"],
    ],
  },
  nd_dunn: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38025"],
      ["<", ["get", "GEOID20"], "38026"],
    ],
  },
  nd_mckenzie: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38053"],
      ["<", ["get", "GEOID20"], "38054"],
    ],
  },
  nd_mountrail: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38061"],
      ["<", ["get", "GEOID20"], "38062"],
    ],
  },
  nd_ramsey: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38071"],
      ["<", ["get", "GEOID20"], "38072"],
    ],
  },
  nd_rollette: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38079"],
      ["<", ["get", "GEOID20"], "38080"],
    ],
  },
  nd_sioux: {
    native_american: true,
    number_markers: true,
    shapefile: true,
    county_filter: [
      "all",
      [">", ["get", "GEOID20"], "38085"],
      ["<", ["get", "GEOID20"], "38086"],
    ],
  },
  ohio: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    // find_unpainted: true - needs contiguity
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
    school_districts: true,
    current_districts: true,
    // COI clusters.
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.ohio_bg_clusters",
          },
          type: "fill",
          sourceLayer: "ohio_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/OH/clusters.json",
      },
    },
  },
  ohcentral: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    municipalities: "Cities and Towns",
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  ohakron: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  ohcin: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  ohcle: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  ohse: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  ohtoledo: {
    multiyear: 2019,
    number_markers: true,
    shapefile: true,
    school_districts: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  akroncanton: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  cincinnati: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  clevelandeuclid: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  columbus: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  dayton: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  limaoh: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  mansfield: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  portsmouthoh: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  toledo: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  youngstown: {
    number_markers: true,
    shapefile: true,
    border: true,
    portal: {
      endpoint: "https://portal.ohio-mapping.org",
    },
  },
  oklahoma: {
    number_markers: true,
    native_american: true,
    county_brush: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  ontarioca: {
    number_markers: true,
    border: true,
  },
  oregon: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
  },
  portlandor: {
    number_markers: true,
    contiguity: 2,
    border: true,
  },
  portland23: {
    number_markers: true,
    // contiguity: 2,
    border: true,
    county_brush: true,
    shapefile: true,
    boundaries: [
      // {
      //   id: 'precincts',
      //   label: 'Voter Precincts link:https://rlisdiscovery.oregonmetro.gov/datasets/drcMetro::voter-precincts-1/about',
      //   path: 'portland/precincts2',
      //   lineColor: '#80231c',
      //   lineWidth: 1.5,
      //   centroids: true,
      //   namefield: "PRECINCTID",
      // },
      {
        id: "neighborhood",
        label:
          "Neighborhood Organizations link:https://rlisdiscovery.oregonmetro.gov/datasets/drcMetro::neighborhood-organizations-1/about",
        path: "portland/neighborhoods",
        lineColor: "#227B22",
        lineWidth: 2,
        centroids: true,
        namefield: "NAME",
      },
      {
        id: "schools",
        label:
          "School Districts link:https://rlisdiscovery.oregonmetro.gov/datasets/drcMetro::school-districts-1/about",
        path: "portland/schools",
        lineColor: "#AF00AF",
        lineWidth: 2,
        centroids: true,
        namefield: "DISTNAME",
      },
    ],
  },
  pennsylvania: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    sideload: true,
    load_coi: false,
    contiguity: 2,
    portal: {
      endpoint: "https://portal.pennsylvania-mapping.org",
    },
  },
  pa_adj: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    sideload: true,
    load_coi: false,
    contiguity: 2,
  },
  pa_prison_adj: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
    sideload: true,
    load_coi: false,
    contiguity: 2,
  },
  philadelphia: {
    number_markers: true,
    contiguity: 2,
    find_unpainted: true,
    border: true,
  },
  puertorico: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  puertorico_prec: {
    number_markers: true,
    parties: [
      "Nuevo Progresista",
      "Popular Democrático",
      "Nuevo Progresista",
      "Popular Democrático",
    ],
    shapefile: true,
    // find_unpainted: true,
  },
  rhode_island: {
    number_markers: true,
    shapefile: true,
  },
  providence_ri: {
    border: true,
  },
  cranston_ri: {
    border: true,
    shapefile: true,
    number_markers: true,
    find_unpainted: true,
  },
  southcarolina: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
  },
  southdakota: {
    native_american: true,
    number_markers: true,
    county_brush: true,
    shapefile: true,
  },
  tennessee: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
  },
  texas: {
    number_markers: true,
    county_brush: true,
    contiguity: 2,
    shapefile: true,
    find_unpainted: true,
    sideload: true,
    portal: {
      endpoint: "https://portal.texas-mapping.org",
    },
  },
  tarranttx: {
    number_markers: true,
    contiguity: true,
  },
  harristx: {
    number_markers: true,
    contiguity: true,
  },
  tx_vra: {
    vra_effectiveness: true,
    county_brush: true,
    number_markers: true,
  },
  dallastx: {
    border: true,
    number_markers: true,
    shapefile: true,
    current_districts: true,
  },
  austin: {
    border: true,
    number_markers: true,
    shapefile: true,
    find_unpainted: true,
    contiguity: true,
  },
  fortworth: {
    border: true,
    number_markers: true,
  },
  houston: {
    border: true,
    number_markers: true,
    shapefile: true,
    multiyear: 2019,
  },
  elpasotx: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        id: "precinct_gj",
        label: "Current Precincts",
        path: "elpasotx_precincts",
        namefield: "CURRENT_PC",
        unitType: "block",
        centroids: true,
      },
    ],
  },
  elpaso2: {
    border: true,
    number_markers: true,
    shapefile: true,
    boundaries: [
      {
        id: "precinct_gj",
        label: "Current Precincts",
        path: "elpasotx_precincts",
        namefield: "CURRENT_PC",
        unitType: "blockgroup",
        centroids: true,
      },
    ],
  },
  utah: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    // find_unpainted: true,
    portal: {
      endpoint: "https://portal.utah-mapping.org",
    },
  },
  cacheco: {
    number_markers: true,
    border: true,
    shapefile: true,
  },
  grand_county_2: {
    portal: {
      endpoint: "https://portal.utah-mapping.org",
    },
    shapefile: true,
  },
  grand_county_3: {
    portal: {
      endpoint: "https://portal.utah-mapping.org",
    },
    shapefile: true,
  },
  vermont: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    // find_unpainted: true,
  },
  virginia: {
    number_markers: true,
    county_brush: true,
    // native_american: true,
    shapefile: true,
    // find_unpainted: true,
    load_coi: false,
    portal: {
      endpoint: "https://portal.virginia-mapping.org",
    },
    boundaries: [
      {
        id: "va2010",
        label: "2003-2013 Congressional Plan",
        path: "virginia_2010",
      },
      {
        id: "va2013",
        label: "2013-2017 Congressional Plan",
        path: "virginia_2013",
      },
    ],
  },
  vabeach: {
    multiyear: 2018,
    number_markers: true,
    border: true,
    // find_unpainted: true,
  },
  washington: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
    contiguity: 2,
  },
  yakima_wa: {
    coalition: false,
  },
  kingcountywa: {
    border: true,
  },
  westvirginia: {
    number_markers: true,
    county_brush: true,
    shapefile: true,
    find_unpainted: true,
  },
  wisconsin: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
    current_districts: true,
    school_districts: true,
    municipalities: true,
    contiguity: 2,
    portal: {
      endpoint: "https://portal.wisconsin-mapping.org",
    },
    sideload: true,
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.wisconsin_bg_clusters",
          },
          type: "fill",
          sourceLayer: "wisconsin_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/WI/clusters.json",
      },
    },
  },
  wisconsin2020: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
    current_districts: true,
    school_districts: true,
    municipalities: true,
    contiguity: 2,
    portal: {
      endpoint: "https://portal.wisconsin-mapping.org",
    },
    sideload: true,
    load_coi: true,
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.wisconsin_bg_clusters",
          },
          type: "fill",
          sourceLayer: "wisconsin_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/WI/clusters.json",
      },
    },
  },
  wisco2019acs: {
    number_markers: true,
    county_brush: true,
    native_american: true,
    shapefile: true,
    find_unpainted: true,
    current_districts: true,
    school_districts: true,
    municipalities: true,
    contiguity: 2,
    portal: {
      endpoint: "https://portal.wisconsin-mapping.org",
    },
    sideload: true,
    coi: {
      tilesets: [
        {
          source: {
            type: "vector",
            url: "mapbox://districtr.wisconsin_bg_clusters",
          },
          type: "fill",
          sourceLayer: "wisconsin_bg_clusters",
          clusterLayer: true,
        },
      ],
      clusterKey: "cluster",
      clusterData: {
        url: "/assets/clusters/WI/clusters.json",
      },
    },
  },
  wyoming: {
    native_american: true,
    number_markers: true,
  },
};
