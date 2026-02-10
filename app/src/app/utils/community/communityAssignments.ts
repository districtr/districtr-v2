'use client';

// Community assignment LUT (dense windowed bitmask) for fast add/remove/lookup.
// This is intentionally separate from zone assignments to avoid changing the existing paint flow.
const DEFAULT_MAX_COMMUNITIES = 50;

// For each community, we will store the assignment using a array of 8-bit integers
// Each bit in the integer represents whether a particular zone is assigned to the
// community associeated with that slot in the array. So, for example, if we look
// at community with slot id 12, then we will need to look at the 12th bit of the
// array. This appears in the 4th bit of the second integer.
//
// Note that since the number of communities is expected to be relatively small
// (less than 1000 even if we were to extend this scheme), it does not cost us
// much memory to use a dense bitmask compared to a list of assigned communities
// since each 'number' type in modern TS consumes 64 bits. As the number of
// communities present on the map increases, the expected value of the number
// of communities an individual geometry is assigned to is also expected to
// increase, so we maintain memory parity. However the lookups in the dense
// array scheme are O(1) because we can directly index into the array and check
// the relevant bit, whereas in a list of assigned communities, we would need to
// perform a linear search.
const WINDOW_SIZE = 8;
const VALUES_PER_COMMUNITY_ASSIGN_CHUNK = 2 ** WINDOW_SIZE; // 256

/**
 * Precompute the map that takes bit values to their corresponding offsets in the
 * u8 array. This allows us to quickly determine which bits are set in a given
 * integer and their corresponding positions in the array.
 *
 * For example, if we have the integer 13 (which is 00001101 in binary), we can
 * quickly determine that the community with a assignment array of the
 * form [0, 13, 0, ...] has been assigned to communities 8, 10, and 11. The
 * base offset is 8 since we are in the second position of the array, and the
 * decoded u8 value of 13 tells us that the communities at offsets 0, 2, and 3
 * (relative to the base offset) are assigned.
 *
 * @returns A 2D array where the first dimension corresponds to the integer value
 * and the second dimension is a list of bit positions that are set in that integer.
 * For example, the entry at index 13 will be [0, 2, 3] since the bits at those
 * positions are set to 1 the binary representation of 13.
 */
function buildBitsToU8AssinmentOffset(): number[][] {
  const u8bitsToOffsetArray: number[][] = Array.from(
    { length: VALUES_PER_COMMUNITY_ASSIGN_CHUNK },
    () => []
  );
  for (let i = 0; i < VALUES_PER_COMMUNITY_ASSIGN_CHUNK; i++) {
    const positions: number[] = [];
    for (let bit = 0; bit < WINDOW_SIZE; bit++) {
      if ((i & (1 << bit)) !== 0) {
        positions.push(bit);
      }
    }
    u8bitsToOffsetArray[i] = positions;
  }
  return u8bitsToOffsetArray;
}

const BITS_FOR_BYTE = buildBitsToU8AssinmentOffset();

export type CommunityAssignmentsConfig = {
  /** Maximum number of communities supported by the document*/
  maxCommunities?: number;

  /** Initial capacity for the geometry assignment array (number of geometries)
   *  Note that this may need to expand as we shatter geometries, so it is not a
   *  hard limit.
   * */
  initialGeomCapacity?: number;
};

/**
 * Normalize a raw max communities value, falling back to defaults.
 * Ensures a positive integer.
 *
 * @param raw The raw input value for max communities, which may be of any type.
 * @param fallback The fallback value to use if the raw input is invalid. Defaults to
 *  DEFAULT_MAX_COMMUNITIES.
 *
 * @returns A normalized max communities value that is a positive integer. If the raw input
 */
export const resolveMaxCommunities = (
  raw: unknown,
  fallback: number = DEFAULT_MAX_COMMUNITIES
): number => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < 1) return fallback;
  return rounded;
};

/**
 * Dense, windowed bitmask storage for community assignments. Everything in here
 * is a flat array lookup, so we can efficiently read/write community assignments for
 * geometries without needing to perform expensive map lookups or array searches.
 *
 * - Each geometry will have an associated array of 8-bit integers (u8 array) that
 *    represents the communities it is assigned to.
 * - Given a community ID, x, we can determine that the byte storing the assignment for that
 *    community is at index Math.floor(x / 8) (faster, x >> 3) in the array, and the bit within
 *    that byte is at position (x % 8) (faster, 1 << (x & 7) ).
 * - The geometries themselves will be identified by a stable integer index
 *    that is allocated to each geoid
 */
export class CommunityAssignmentsLUT {
  // Track the maximum number of communities that can be stored in the LUT.
  private maxCommunities: number;
  // The number of u8 windows needed to store the community assignments based on the max
  // communities.
  private nWindows: number;
  // The capacity of the LUT in terms of number of geometries. This can expand as needed.
  private capacity: number;
  // The main LUT array that stores the community assignments for each geometry. The length of
  // this array is capacity * nWindows, where each geometry has nWindows u8 values to represent
  // its community assignments. Each bit in those u8 values corresponds to a community assignment.
  private assignments: Uint8Array;
  // Track which geometries are active (i.e. currently present on the map). This allows
  // us to efficiently ignore geometries that have been removed from the rendering pipeline
  // (say, through shatter/heal) without having to resize the entire LUT.
  private active: Uint8Array;
  // Track which geometries have any community assignments. This allows us to efficiently skip
  // geometries that have no community assignments when iterating through the LUT, without having
  // to check each geometry's assignment array.
  private hasAssignments: Uint8Array;
  // Map from geoid to geometry index in the LUT arrays.
  private geomIdToIndex: Map<string, number>;
  // Stack of free geometry indices that can be reused when geometries are removed.
  private freeGeomIndices: number[];
  // List of currently assigned geometry indices, used for efficient iteration.
  private assignedGeomIndices: number[];
  // The next geometry index to assign if there are no free indices available.
  private nextGeomIndex: number;

  constructor({
    maxCommunities = DEFAULT_MAX_COMMUNITIES,
    initialGeomCapacity = 0,
  }: CommunityAssignmentsConfig = {}) {
    this.maxCommunities = maxCommunities;
    this.nWindows = Math.ceil(this.maxCommunities / WINDOW_SIZE);
    this.capacity = initialGeomCapacity;
    this.assignments = new Uint8Array(this.capacity * this.nWindows);
    this.active = new Uint8Array(this.capacity);
    this.hasAssignments = new Uint8Array(this.capacity);
    this.geomIdToIndex = new Map();
    this.freeGeomIndices = [];
    this.assignedGeomIndices = [];
    this.nextGeomIndex = 0;
  }

  /** Reset all internal state. Optionally update maxCommunities.
   *
   * @param maxCommunities Optionally update the maximum number of communities supported by the
   *  LUT. If not provided, it will retain the existing value.
   */
  reset({ maxCommunities = this.maxCommunities }: { maxCommunities?: number } = {}): void {
    this.maxCommunities = maxCommunities;
    this.nWindows = Math.ceil(this.maxCommunities / WINDOW_SIZE);
    this.capacity = 0;
    this.assignments = new Uint8Array(0);
    this.active = new Uint8Array(0);
    this.hasAssignments = new Uint8Array(0);
    this.geomIdToIndex.clear();
    this.freeGeomIndices = [];
    this.assignedGeomIndices = [];
    this.nextGeomIndex = 0;
  }

  getMaxCommunities(): number {
    return this.maxCommunities;
  }

  /** Ensure that the backing arrays can accomodatte the given number of geometries, expanding
   * if necessary.
   *
   * @param minCapacity The minimum number of geometries that the LUT should be able to store.
   *  If the current capacity is less than this value, the backing arrays will be expanded to
   *  accommodate at least this many geometries.
   */
  private ensureGeomCapacity(minCapacity: number): void {
    if (minCapacity <= this.capacity) return;
    const newCapacity = Math.max(minCapacity, this.capacity * 1.5);

    const newAssignments = new Uint8Array(newCapacity * this.nWindows);
    newAssignments.set(this.assignments);
    this.assignments = newAssignments;

    const newActive = new Uint8Array(newCapacity);
    newActive.set(this.active);
    this.active = newActive;

    const newHasAssignments = new Uint8Array(newCapacity);
    newHasAssignments.set(this.hasAssignments);
    this.hasAssignments = newHasAssignments;

    this.capacity = newCapacity;
  }

  /** Allocate a geometry index, reusing from the free stack if possible.
   *
   * @returns The allocated geometry index that can be used to store community assignments for a
   *  geometry.
   */
  private allocateGeomIndex(): number {
    const reused = this.freeGeomIndices.pop();
    if (reused !== undefined) {
      return reused;
    }
    const idx = this.nextGeomIndex;
    this.nextGeomIndex += 1;

    // May need to resize the backing arrays to accommodate the new geometry index.
    this.ensureGeomCapacity(this.nextGeomIndex);
    return idx;
  }

  /** Clear all assignments for a geometry index. Used when erasing communities from the
   * map.
   *
   * @param geomIndex The geometry index for which to clear all community assignments.
   */
  private clearAssignmentsForGeomIndex(geomIndex: number): void {
    const base = geomIndex * this.nWindows;
    this.assignments.fill(0, base, base + this.nWindows);
    this.hasAssignments[geomIndex] = 0;
  }

  /** check if a geometry index has no community assignments in the LUT.
   *
   * @param geomIndex The geometry index to check for community assignments.
   * @returns True if the geometry index has no community assignments, false otherwise.
   */
  private geomIndexHasNoAssignments(geomIndex: number): boolean {
    const base = geomIndex * this.nWindows;
    for (let i = 0; i < this.nWindows; i++) {
      if (this.assignments[base + i] !== 0) {
        return false;
      }
    }
    return true;
  }

  /** Get or create a geometry index for the given geoid.
   *
   * @param geoid The geoid for which to get or create a geometry index.
   * @returns The geometry index associated with the given geoid.
   */
  getOrCreateGeomIndex(geoid: string): number {
    let geomIndex = this.geomIdToIndex.get(geoid);
    if (geomIndex === undefined) {
      geomIndex = this.allocateGeomIndex();
      this.geomIdToIndex.set(geoid, geomIndex);
      this.active[geomIndex] = 1;
    }
    return geomIndex;
  }

  /** Get the geometry index for a given geoid, if it exists.
   *
   * @param geoid The geoid for which to get the geometry index.
   * @returns The geometry index associated with the given geoid, or undefined if it
   *  does not exist.
   */
  getGeomIndex(geoid: string): number | undefined {
    return this.geomIdToIndex.get(geoid);
  }

  /** Mark a geomety as active/inactive (used for shatter/heal).
   *
   * @param geoid The geoid of the geometry to mark as active/inactive.
   * @param isActive Whether to mark the geometry as active (true) or inactive (false).
   *  Inactive geometries will be ignored in paint flow and can be reused for new geometries.
   */
  setActiveByGeoid(geoid: string, isActive: boolean): void {
    const geomIndex = this.geomIdToIndex.get(geoid);
    if (geomIndex === undefined) {
      return;
    }
    this.active[geomIndex] = isActive ? 1 : 0;
    // NOTE: We don't want to clear assignments here. The base geometry may eventually
    // be healed back, and if we free the geoid for reuse, we can end up with a lower
    // level geometry occupying the space that was reserved for the base geometry.
  }

  /**
   * Release a geometry entirely from the LUT, clearing all assignments and freeing up its
   * index for reuse. This allows memory to be reused for future child geometries.
   *
   * @param geoid The geoid of the geometry to release from the LUT.
   */
  releaseGeomByGeoid(geoid: string): void {
    const geomIndex = this.geomIdToIndex.get(geoid);
    if (geomIndex === undefined) {
      return;
    }
    this.clearAssignmentsForGeomIndex(geomIndex);
    this.active[geomIndex] = 0;
    this.geomIdToIndex.delete(geoid);
    this.freeGeomIndices.push(geomIndex);
  }

  /**
   * Add a community assignment for a given geoid and community ID.
   *
   * @param geoid The geoid of the geometry to which the community assignment should be added.
   * @param communityId The ID of the community to assign to the geometry.
   * @returns True if the assignment was changed.
   */
  addAssignment(geoid: string, communityId: number): boolean {
    if (communityId < 0 || communityId >= this.maxCommunities) {
      console.warn(
        `Community ID ${communityId} is out of bounds for max communities ${this.maxCommunities}`
      );
      return false;
    }
    const geomIndex = this.getOrCreateGeomIndex(geoid);
    const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
    const communityBit = 1 << (communityId & 7); // communityId % 8
    const assignmentOffset = geomIndex * this.nWindows + communityWindow;
    const previousValue = this.assignments[assignmentOffset];

    if (previousValue & communityBit) {
      // Assignment already exists, no change needed.
      return false;
    }

    this.assignments[assignmentOffset] = previousValue | communityBit;
    if (!this.hasAssignments[geomIndex]) {
      this.hasAssignments[geomIndex] = 1;
      this.assignedGeomIndices.push(geomIndex);
    }
    return true;
  }

  /**
   * Remove a community assignment for a given geoid and community ID.
   *
   * @param geoid The geoid of the geometry from which the community assignment should be removed.
   * @param communityId The ID of the community to remove from the geometry.
   * @returns True if the assignment was changed.
   */
  removeAssignment(geoid: string, communityId: number): boolean {
    if (communityId < 0 || communityId >= this.maxCommunities) {
      console.warn(
        `Community ID ${communityId} is out of bounds for max communities ${this.maxCommunities}`
      );
      return false;
    }
    const geomIndex = this.getGeomIndex(geoid);
    if (geomIndex === undefined) {
      // No existing geometry index for this geoid, so no assignment to remove.
      return false;
    }
    const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
    const communityBit = 1 << (communityId & 7); // communityId % 8
    const assignmentOffset = geomIndex * this.nWindows + communityWindow;
    const previousValue = this.assignments[assignmentOffset];

    if ((previousValue & communityBit) === 0) {
      // Assignment does not exist, no change needed.
      return false;
    }

    this.assignments[assignmentOffset] = previousValue & ~communityBit;

    // NOTE: The geomIndexHasNoAssignments check is linear in the number of windows,
    // and reads through the assignment array for the geometry. However, the number
    // of windows is log_2(maxCommunities), so this should still scale well since
    // we literally just check that all the bytes for the geometry are 0.
    if (this.hasAssignments[geomIndex] && this.geomIndexHasNoAssignments(geomIndex)) {
      this.hasAssignments[geomIndex] = 0;
    }
    return true;
  }

  /**
   * Build a per-window bitmask for a set of community IDs. Useful for bulk erase operations.
   *
   * @param communityIds An iterable of community IDs for which to build the bitmask.
   * @return A Uint8Array where each index corresponds to a window, and the bits set in each byte
   * indicate which community IDs (within that window) are included in the input set. For example,
   * if communityIds includes 10 and 11, then the byte at index 1 (since 10 and 11 are in the
   * second window of 8 communities) will have bits 2 and 3 set (since 10 % 8 = 2 and 11 % 8 = 3),
   * resulting in a value of 12 (00001100 in binary) at index 1 of the returned array.
   */
  buildMaskForCommunityIds(communityIds: Iterable<number>): Uint8Array {
    const maskByWindow = new Uint8Array(this.nWindows);
    for (const communityId of communityIds) {
      if (communityId < 0 || communityId >= this.maxCommunities) {
        continue;
      }
      const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
      const communityBit = 1 << (communityId & 7); // communityId % 8
      maskByWindow[communityWindow] |= communityBit;
    }
    return maskByWindow;
  }

  /**
   * Remove assignments covered by a per-window mask in one pass.
   *
   * @param geoid The geoid of the geometry from which to remove the community assignments.
   * @param maskByWindow A Uint8Array where each index corresponds to a window, and the bits set
   * in each byte indicate which community IDs (within that window) should be removed from the
   * geometry's assignments.
   * @param remainingAssignmentsOut An optional output array that will be populated with the
   * community IDs that remain assigned to the geometry after the removals. This allows the caller
   * to efficiently determine which communities are still assigned to the geometry without needing
   * to perform additional lookups after the removals.
   *
   * @returns An object containing a boolean indicating whether any assignments were changed, and
   * the list of remaining community IDs assigned to the geometry after the removals.
   */
  removeAssignmentsByMask(
    geoid: string,
    maskByWindow: Uint8Array,
    remainingAssignmentsOut: number[] = []
  ): { changed: boolean; remainingAssignments: number[] } {
    remainingAssignmentsOut.length = 0;
    const geomIndex = this.getGeomIndex(geoid);
    if (geomIndex === undefined || !this.hasAssignments[geomIndex]) {
      return { changed: false, remainingAssignments: remainingAssignmentsOut };
    }

    const assignmentBase = geomIndex * this.nWindows;
    let changed = false;
    for (let i = 0; i < this.nWindows; i++) {
      const clearMask = maskByWindow[i] ?? 0;
      if (clearMask === 0) {
        continue;
      }
      const previousValue = this.assignments[assignmentBase + i];
      const nextValue = previousValue & ~clearMask;
      if (nextValue !== previousValue) {
        this.assignments[assignmentBase + i] = nextValue;
        changed = true;
      }
    }

    if (!changed) {
      return { changed: false, remainingAssignments: remainingAssignmentsOut };
    }

    let hasAnyCommunitiesAssigned = false;
    for (let i = 0; i < this.nWindows; i++) {
      const assignmentValue = this.assignments[assignmentBase + i];
      if (assignmentValue === 0) {
        continue;
      }
      hasAnyCommunitiesAssigned = true;
      const bitOffsets = BITS_FOR_BYTE[assignmentValue];
      for (const bitOffset of bitOffsets) {
        const communityId = i * WINDOW_SIZE + bitOffset;
        if (communityId < this.maxCommunities) {
          remainingAssignmentsOut.push(communityId);
        }
      }
    }

    this.hasAssignments[geomIndex] = hasAnyCommunitiesAssigned ? 1 : 0;
    return { changed: true, remainingAssignments: remainingAssignmentsOut };
  }

  /**
   * Check if a geoid has been assigned to a given community.
   *
   * @param geoid The geoid of the geometry to check for the community assignment.
   * @param communityId The ID of the community to check for assignment to the geometry.
   * @returns True if the geometry is assigned to the community, false otherwise.
   */
  hasAssignment(geoid: string, communityId: number): boolean {
    if (communityId < 0 || communityId >= this.maxCommunities) {
      console.warn(
        `Community ID ${communityId} is out of bounds for max communities ${this.maxCommunities}`
      );
      return false;
    }
    const geomIndex = this.getGeomIndex(geoid);
    if (geomIndex === undefined) {
      return false;
    }
    const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
    const communityBit = 1 << (communityId & 7); // communityId % 8
    const assignmentOffset = geomIndex * this.nWindows + communityWindow;
    return (this.assignments[assignmentOffset] & communityBit) !== 0;
  }

  /**
   * Clear all community assignments for a given geoid.
   *
   * @param geoid The geoid of the geometry for which to clear community assignments.
   */
  clearAssignmentsForGeoid(geoid: string): void {
    const geomIndex = this.getGeomIndex(geoid);
    if (geomIndex === undefined) {
      return;
    }
    this.clearAssignmentsForGeomIndex(geomIndex);
  }

  /**
   * Remove a community assignment across all geometries. Used when deleting a community from
   * the map.
   *
   * @param communityId The ID of the community to remove from all geometries.
   */
  clearAssignmentsForCommunity(communityId: number): void {
    if (communityId < 0 || communityId >= this.maxCommunities) {
      console.warn(
        `Community ID ${communityId} is out of bounds for max communities ${this.maxCommunities}`
      );
      return;
    }
    const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
    const communityBit = 1 << (communityId & 7); // communityId % 8

    for (const index of this.assignedGeomIndices) {
      if (!this.active[index] || !this.hasAssignments[index]) {
        continue;
      }
      const assignmentOffset = index * this.nWindows + communityWindow;
      const previousValue = this.assignments[assignmentOffset];
      if ((previousValue & communityBit) !== 0) {
        this.assignments[assignmentOffset] = previousValue & ~communityBit;

        if (this.geomIndexHasNoAssignments(index)) {
          this.hasAssignments[index] = 0;
        }
      }
    }
  }

  /**
   * Clear assignments for all communities represented in the provided mask, in one pass.
   *
   * @param maskByWindow Per-window bitmask indicating which community bits to clear.
   * @param includeInactive Whether to include inactive geometries.
   * @returns Geoids whose assignments changed.
   */
  clearAssignmentsByMask(maskByWindow: Uint8Array, includeInactive: boolean = false): string[] {
    const changedGeoids: string[] = [];
    for (const [geoid, index] of this.geomIdToIndex.entries()) {
      if (!includeInactive && !this.active[index]) {
        continue;
      }
      if (!this.hasAssignments[index]) {
        continue;
      }

      const assignmentBase = index * this.nWindows;
      let changed = false;
      for (let i = 0; i < this.nWindows; i++) {
        const clearMask = maskByWindow[i] ?? 0;
        if (clearMask === 0) {
          continue;
        }
        const previousValue = this.assignments[assignmentBase + i];
        const nextValue = previousValue & ~clearMask;
        if (nextValue !== previousValue) {
          this.assignments[assignmentBase + i] = nextValue;
          changed = true;
        }
      }

      if (!changed) {
        continue;
      }
      changedGeoids.push(geoid);
      if (this.geomIndexHasNoAssignments(index)) {
        this.hasAssignments[index] = 0;
      }
    }
    return changedGeoids;
  }

  /**
   * Rebuild the internal assigned-geometry index list from scratch. Useful after bulk
   * removals or heal events to keep the assignment scans efficient.
   */
  compactAssignedGeomIndices(): void {
    const rebuilt: number[] = [];
    for (let i = 0; i < this.nextGeomIndex; i++) {
      if (this.hasAssignments[i]) {
        rebuilt.push(i);
      }
    }
    const lengthChanged = rebuilt.length !== this.assignedGeomIndices.length;
    const contentChanged = rebuilt.some(
      (value, index) => value !== this.assignedGeomIndices[index]
    );
    if (lengthChanged || contentChanged) {
      this.assignedGeomIndices = rebuilt;
    }
  }

  /**
   * Get all community IDs assigned to a given geoid.
   *
   * @param geoid The geoid of the geometry for which to get assigned community IDs.
   * @returns An array of community IDs that are assigned to the geometry.
   */
  getAssignmentsForGeoid(geoid: string): number[] {
    const geomIndex = this.getGeomIndex(geoid);
    if (geomIndex === undefined || !this.hasAssignments[geomIndex]) {
      return [];
    }
    const assignedCommunities: number[] = [];
    const assignmentBase = geomIndex * this.nWindows;

    for (let i = 0; i < this.nWindows; i++) {
      const assignmentValue = this.assignments[assignmentBase + i];
      if (assignmentValue === 0) {
        continue;
      }
      const bitOffsets = BITS_FOR_BYTE[assignmentValue];
      for (const bitOffset of bitOffsets) {
        const communityId = i * WINDOW_SIZE + bitOffset;
        if (communityId < this.maxCommunities) {
          assignedCommunities.push(communityId);
        }
      }
    }
    return assignedCommunities;
  }

  /**
   * Get all geoids assigned to a given community ID.
   *
   * @param communityId The ID of the community for which to get assigned geoids.
   * @param includeInactive Whether to include inactive geometries in the results. Inactive
   *  geometries are those that have been marked as inactive (e.g. through shatter) and are
   *  not currently present on the map. By default, this is false, and inactive geometries
   *  will be excluded from the results. Needed after a heal event.
   * @returns An array of geoids that are assigned to the community.
   */
  getGeoidsForCommunity(communityId: number, includeInactive: boolean = false): string[] {
    if (communityId < 0 || communityId >= this.maxCommunities) {
      console.warn(
        `Community ID ${communityId} is out of bounds for max communities ${this.maxCommunities}`
      );
      return [];
    }
    const communityWindow = communityId >> 3; // Math.floor(communityId / 8)
    const communityBit = 1 << (communityId & 7); // communityId % 8
    const assignedGeoids: string[] = [];

    for (const [geoid, indesx] of this.geomIdToIndex.entries()) {
      if (!includeInactive && !this.active[indesx]) {
        continue;
      }
      const assignmentOffset = indesx * this.nWindows + communityWindow;
      if ((this.assignments[assignmentOffset] & communityBit) !== 0) {
        assignedGeoids.push(geoid);
      }
    }
    return assignedGeoids;
  }

  /**
   * Union the assignments from child geoids onto a parent geoid. Missing geoids
   * treated as empty
   *
   * @param parentGeoid The geoid of the parent geometry onto which to union the child assignments.
   * @param childGeoids An array of geoids for the child geometries whose assignments should be
   *  unioned onto the parent geometry.
   */
  unionAssignments(childGeoIds: Iterable<string>, parentGeoid: string): void {
    const parentGeomIndex = this.getOrCreateGeomIndex(parentGeoid);
    const mergedAssignments = new Uint8Array(this.nWindows);

    for (const childGeoid of childGeoIds) {
      const childGeomIndex = this.getGeomIndex(childGeoid);
      if (childGeomIndex === undefined || !this.hasAssignments[childGeomIndex]) {
        continue;
      }
      const childAssignmentBase = childGeomIndex * this.nWindows;
      for (let i = 0; i < this.nWindows; i++) {
        mergedAssignments[i] |= this.assignments[childAssignmentBase + i];
      }
    }

    const parentAssignmentBase = parentGeomIndex * this.nWindows;
    this.assignments.set(mergedAssignments, parentAssignmentBase);
    if (this.geomIndexHasNoAssignments(parentGeomIndex)) {
      this.hasAssignments[parentGeomIndex] = 0;
    } else if (!this.hasAssignments[parentGeomIndex]) {
      this.hasAssignments[parentGeomIndex] = 1;
      this.assignedGeomIndices.push(parentGeomIndex);
    }
    this.active[parentGeomIndex] = 1;
  }

  /**
   * Check if two geoids share any community assignments. Useful for determining whether to
   * merge geometries during heal.
   *
   * @param geoidA The geoid of the first geometry to check for shared community assignments.
   * @param geoidB The geoid of the second geometry to check for shared community assignments.
   * @returns True if the two geometries share at least one community assignment, false otherwise.
   */
  haveSameAssignments(geoidA: string, geoidB: string): boolean {
    const geomIndexA = this.getGeomIndex(geoidA);
    const geomIndexB = this.getGeomIndex(geoidB);
    if (geomIndexA === undefined && geomIndexB === undefined) {
      // If neither geometry has any assignments, we can consider them as sharing the same
      // (empty) set of assignments.
      return true;
    }
    if (geomIndexA === undefined || geomIndexB === undefined) {
      return false;
    }
    if (geomIndexA === geomIndexB) {
      return true;
    }
    if (!this.hasAssignments[geomIndexA] && !this.hasAssignments[geomIndexB]) {
      // If neither geometry has any assignments, we can consider them as sharing the same
      // (empty) set of assignments.
      return true;
    }
    const assignmentBaseA = geomIndexA * this.nWindows;
    const assignmentBaseB = geomIndexB * this.nWindows;

    for (let i = 0; i < this.nWindows; i++) {
      if (this.assignments[assignmentBaseA + i] !== this.assignments[assignmentBaseB + i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Copy all assignments from a source geoid to a target geoid. This is used for shatter operations
   * where we want to preserve the community assignments of the original geometry on the new
   * geometries created by the shatter.
   *
   * @param sourceGeoid The geoid of the geometry from which to copy community assignments.
   * @param targetGeoid The geoid of the geometry to which the community assignments should be copied.
   */
  copyAssignments(sourceGeoid: string, targetGeoid: string): void {
    const sourceGeomIndex = this.getGeomIndex(sourceGeoid);
    if (sourceGeomIndex === undefined) {
      return;
    }
    const targetGeomIndex = this.getOrCreateGeomIndex(targetGeoid);
    const sourceAssignmentBase = sourceGeomIndex * this.nWindows;
    const targetAssignmentBase = targetGeomIndex * this.nWindows;

    for (let i = 0; i < this.nWindows; i++) {
      this.assignments[targetAssignmentBase + i] = this.assignments[sourceAssignmentBase + i];
    }
    if (this.geomIndexHasNoAssignments(targetGeomIndex)) {
      this.hasAssignments[targetGeomIndex] = 0;
    } else if (!this.hasAssignments[targetGeomIndex]) {
      this.hasAssignments[targetGeomIndex] = 1;
      this.assignedGeomIndices.push(targetGeomIndex);
    }
    this.active[targetGeomIndex] = 1;
  }

  /**
   * Mark a geometry index as active or inactive.
   *
   * @param geoIndex The geometry index to mark as active or inactive.
   * @param active Whether to mark the geometry index as active (true) or inactive (false).
   */
  setActiveByGeomIndex(geoIndex: number, active: boolean): void {
    if (geoIndex < 0 || geoIndex >= this.capacity) {
      console.warn(`Geometry index ${geoIndex} is out of bounds for capacity ${this.capacity}`);
      return;
    }
    this.active[geoIndex] = active ? 1 : 0;
  }

  /**
   * Check if a geometry index has any assignments.
   *
   * @param geoIndex The geometry index to check for assignments.
   * @returns True if the geometry index has at least one community assignment, false otherwise.
   */
  geomIndexHasAssignments(geoIndex: number): boolean {
    return this.hasAssignments[geoIndex] === 1;
  }
}

/**
 * Shared singleton used by the client. This is stateful and intentionally not persisted.
 */
export const communityAssignments = new CommunityAssignmentsLUT({
  maxCommunities: DEFAULT_MAX_COMMUNITIES,
});

/** Current max community count for the LUT (defaults to 50). */
export const COMMUNITY_ASSIGNMENTS_MAX = DEFAULT_MAX_COMMUNITIES;
