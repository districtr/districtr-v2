import { Assignment, DistrictrMap } from '@utils/api/apiHandlers';

type AssignmentCache = {
  assignments: Assignment[],
  lastUpdated: string
}

class DistrictrLocalStorageCache {
  mapViews: DistrictrMap[] | undefined = undefined

  constructor() {
    const cachedViews = localStorage.getItem('districtr-map-views')
    if (cachedViews) {
      this.mapViews = JSON.parse(cachedViews)
    }
  }

  getCacheAssignments(document_id: string) {
    const assignments = localStorage.getItem(`districtr-assignments-${document_id}`)
    if (assignments) {
      return JSON.parse(assignments) as AssignmentCache
    }
  }

  cacheViews = async (views: DistrictrMap[]) => {
    this.mapViews = views
    localStorage.setItem('districtr-map-views', JSON.stringify(views))
  }
}

export const districtrLocalStorageCache = new DistrictrLocalStorageCache()