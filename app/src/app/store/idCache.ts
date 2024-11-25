class IdCache {
  cachedTileIndices: Set<string> = new Set()
  parentIds: Set<string> = new Set()

  hasCached(index: string){
    return this.cachedTileIndices.has(index)
  }

  add(index: string, ids: string[]){
    this.cachedTileIndices.add(index)
    ids.forEach(id => this.parentIds.add(id))
  }

  clear(){
    this.parentIds.clear()
    this.cachedTileIndices.clear()
  }

  getFilteredIds(id: string){
    const regex = new RegExp(`^${id}`);
    return Array.from(this.parentIds).filter(f => regex.test(f));
  }
}

export const parentIdCache = new IdCache()
