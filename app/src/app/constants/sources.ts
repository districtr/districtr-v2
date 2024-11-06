"use client"
import {VectorSourceSpecification} from 'maplibre-gl';

export function getBlocksSource(
  layer_subpath: string
): VectorSourceSpecification {
  if (typeof window === 'undefined') {
    return {
    } as any
  }
  return {
    type: "vector",
    tiles: [
      `${window.location.origin}/api/tiles/1/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`,
      `${window.location.origin}/api/tiles/2/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`,
      `${window.location.origin}/api/tiles/3/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`,
      `${window.location.origin}/api/tiles/4/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`
    ],
    promoteId: "path",
  };
}
