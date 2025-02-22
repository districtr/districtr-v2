class DemographyCache {
  entries: Record<string, Record<string, number|string>> = {};
  clear() {
    this.entries = {};
  }
  getFiltered(id: string) {
    const regex = new RegExp(`^(${id}|vtd:${id})`);
    return Object.entries(this.entries).filter(([key]) => regex.test(key));
  }
}

export const demographyCache = new DemographyCache();
