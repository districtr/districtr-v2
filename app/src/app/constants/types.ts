export type Zone = number;

export type GEOID = string;

export type ZoneDict = Map<GEOID, Zone>;

export type ActiveTool = "pan" | "brush" | "eraser"; // others?

export type SpatialUnit = "county" | "tract" | "block"; // others?
