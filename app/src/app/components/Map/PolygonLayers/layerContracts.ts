/**
 * Shared contracts for parent/child polygon layer composition and ordering.
 */
export type BlockLayerOrder = {
  backgroundBeforeId: string;
  zoneBeforeId: string;
  demographyBeforeId: string;
  hoverBeforeId: string;
  outlineBeforeId: string;
};

export type ParentChildBlockLayerOrder = {
  parent: BlockLayerOrder;
  child: BlockLayerOrder;
};
