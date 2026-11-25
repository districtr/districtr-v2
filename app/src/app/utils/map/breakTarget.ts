/** What a break click picks: unbroken units to break, or a broken unit to reopen. */
export type BreakTarget<F> = {units: F[]} | {parentId: string} | null;

/**
 * Which unit a break click (or a Paint/Erase click outside block view's unit)
 * targets. `features` are the clicked units and blocks, already filtered the
 * way picking a unit is (broken units' own features and locked zones dropped),
 * so a broken unit only shows up as one of its blocks. A click on the open
 * unit's own blocks targets nothing; unbroken units win over a block at a
 * shared edge.
 */
export const getBreakTarget = <F extends {id?: string | number}>(
  features: F[],
  childToParent: Map<string, string>,
  openParentId?: string
): BreakTarget<F> => {
  const units = features.filter(f => f.id !== undefined && !childToParent.has(f.id.toString()));
  if (units.length) return {units};
  for (const f of features) {
    const parentId = f.id !== undefined ? childToParent.get(f.id.toString()) : undefined;
    if (parentId !== undefined && parentId !== openParentId) return {parentId};
  }
  return null;
};
