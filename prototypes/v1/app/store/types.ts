export interface DistrictrState {
  /**
   * Assignment of geospatial unit IDs to which district they are assigned to
   */
  assignment: Record<Geoid, DistrictId>;
  /**
   * The current problemID, reprensenting an area of interest
   * or redistricting problem
   */
  problemId?: string;
  /**
   * The current planID, representing a particular redistricting plan
   * created by the user
   */
  planId?: string;
  /**
   * The current geospatial unit being used
   */
  unit?: string;
  /**
   * The current colorscheme being used to visualize
   * different districts
   */
  colorScheme: ColorSchemes
}

export type Geoid = string;
export type DistrictId = string;
export type ColorSchemes = 'tableau10' | string;
