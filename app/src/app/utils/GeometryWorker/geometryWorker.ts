import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import pointOnFeature from '@turf/point-on-feature';
import pointsWithinPolygon from '@turf/points-within-polygon';
import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import bbox from '@turf/bbox';
import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import booleanWithin from '@turf/boolean-within';
import distance from '@turf/distance';
import {getCoords} from '@turf/invariant';

const CENTROID_BUFFER_KM = 10;

const explodeMultiPolygonToPolygons = (
  feature: GeoJSON.MultiPolygon
): Array<GeoJSON.Feature<GeoJSON.Polygon>> => {
  return feature.coordinates.map(coords => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coords,
    },
  })) as Array<GeoJSON.Feature<GeoJSON.Polygon>>;
};

const computeCenterOfMass = async (
  geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  bounds: [number, number, number, number],
  width = 128,
  height = 128
) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', {willReadFrequently: true});

  // Calculate bounds for rendering
  const [minX, minY, maxX, maxY] = bounds
  const scaleX = width / (maxX - minX);
  const scaleY = height / (maxY - minY);
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgb(255,0,0)`;
  ctx.strokeStyle = `rgb(255,0,0)`;
  ctx.lineWidth = 1;

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const coords = getCoords(feature);
    const polygons: GeoJSON.Polygon['coordinates'] =
      geom.type === 'MultiPolygon' ? coords.flat() : coords;

    for (const ring of polygons) {
      ctx.beginPath();
      ring.forEach(([x, y], i) => {
        const px = (x - minX) * scaleX;
        const py = height - (y - minY) * scaleY; // Invert Y
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  const imageData = ctx.getImageData(0, 0, width, height).data;
  let sumX = 0,
    sumY = 0,
    count = 0;
  const validPixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        imageData[i] === 255
      ) {
        sumX += x;
        sumY += y;
        count++;
        validPixels.push({x, y});
      }
    }
  }

  if (count === 0) return null;

  let centerX = sumX / count;
  let centerY = sumY / count;

  const idx = (Math.floor(centerY) * width + Math.floor(centerX)) * 4;
  const isValidCenter = imageData[idx] === 255

  // Fallback: choose a random pixel inside the district
  if (!isValidCenter) {
    const fallback = validPixels[Math.floor(Math.random() * validPixels.length)];
    centerX = fallback.x;
    centerY = fallback.y;
  }

  const lng = minX + centerX / scaleX;
  const lat = maxY - centerY / scaleY;

  return [lng, lat]
};

const GeometryWorker: GeometryWorkerClass = {
  geometries: {},
  activeGeometries: {},
  zoneAssignments: {},
  shatterIds: {
    parents: [],
    children: [],
  },
  previousCentroids: {},
  getPropsById(ids: string[]) {
    const features: MinGeoJSONFeature[] = [];
    ids.forEach(id => {
      const f = this.geometries[id];
      if (f) {
        features.push({
          ...f,
          geometry: undefined as any,
        });
      }
    });
    return features;
  },
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.activeGeometries),
    };
  },
  updateZones(entries) {
    this.zoneAssignments = entries.reduce(
      (acc, [id, zone]) => {
        acc[id] = zone as number;
        return acc;
      },
      {} as Record<string, number>
    );
  },
  handleShatterHeal({parents, children}) {
    const toAdd = [
      ...this.shatterIds.parents.filter(id => !parents.includes(id)),
      ...children.filter(id => !this.shatterIds.children.includes(id)),
    ];
    const toRemove = [
      ...this.shatterIds.children.filter(id => !children.includes(id)),
      ...parents.filter(id => !this.shatterIds.parents.includes(id)),
    ];
    toAdd.forEach(id => {
      this.geometries[id] && (this.activeGeometries[id] = this.geometries[id]);
    });
    toRemove.forEach(id => {
      this.activeGeometries[id] && delete this.activeGeometries[id];
    });
    this.shatterIds = {
      parents,
      children,
    };
  },
  removeGeometries(ids) {
    ids.forEach(id => {
      delete this.geometries[id];
    });
  },
  clear() {
    this.geometries = {};
    this.activeGeometries = {};
    this.previousCentroids = {};
    this.shatterIds = {
      parents: [],
      children: [],
    };
  },
  resetZones() {
    this.zoneAssignments = {};
  },
  loadTileData({tileData, tileID, mapDocument, idProp}) {
    const returnData = [];
    const tile = new VectorTile(new Protobuf(tileData));
    // Iterate through each layer in the tile
    const parentLayer = mapDocument.parent_layer;
    const childLayer = mapDocument.child_layer;
    for (const layerName in tile.layers) {
      const isParent = layerName === parentLayer;
      const layer = tile.layers[layerName];

      // Extract features from the layer
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const id = feature?.properties?.[idProp] as string;
        const prevZoom = this.geometries?.[id]?.zoom;

        if (!id || (prevZoom && prevZoom > tileID.z)) continue;
        let geojsonFeature: any = feature.toGeoJSON(tileID.x, tileID.y, tileID.z);
        geojsonFeature.zoom = tileID.z;
        geojsonFeature.id = id;
        geojsonFeature.sourceLayer = layerName;
        geojsonFeature.properties = feature.properties;
        this.geometries[id as string] = geojsonFeature;
        if (
          (isParent && !this.shatterIds.parents.includes(id)) ||
          (!isParent && this.shatterIds.children.includes(id))
        ) {
          this.activeGeometries[id] = geojsonFeature;
          returnData.push({
            id,
            properties: feature.properties,
            sourceLayer: layerName,
          } as unknown as MinGeoJSONFeature);
        }
      }
    }
    return returnData;
  },
  loadGeometry(featuresOrStringified, idProp) {
    const features: MapGeoJSONFeature[] =
      typeof featuresOrStringified === 'string'
        ? JSON.parse(featuresOrStringified)
        : featuresOrStringified;
    const firstEntry = Object.values(this.geometries)[0];
    features.forEach(f => {
      const id = f.properties?.[idProp];
      // TODO: Sometimes, geometries are split across tiles or reloaded at more detailed zoom levels
      // disambiguating and combining them could be very cool, but is tricky with lots of edge cases
      // and computationally expensive. For now, we just take the first geometry of a given ID
      if (id && !this.geometries[id]) {
        this.geometries[id] = structuredClone(f);
      }
    });
  },
  dissolveGeometry(features) {
    let dissolved: GeoJSON.FeatureCollection = dissolve(
      {
        type: 'FeatureCollection',
        features: features.filter(
          // TODO: Turf dissolve is limted to only polygons. This is fine enough for label placement
          // but in the future we may want to do something better (eg. multipart to singlepart)
          f => f.geometry.type === 'Polygon'
        ) as GeoJSON.Feature<GeoJSON.Polygon>[],
      },
      {
        propertyName: 'zone',
      }
    );
    let largestDissolvedFeatures: Record<number, {feature: GeoJSON.Feature; area: number}> = {};
    dissolved.features.forEach(feature => {
      const zone = this.zoneAssignments[feature.properties?.path];
      if (!zone) return;
      const featureArea = area(feature);
      // TODO: This makes sense for now given that we are not enforcing contiguity on zones,
      // but could likely be refactored later when that rule is enforced.
      if (!largestDissolvedFeatures[zone] || featureArea > largestDissolvedFeatures[zone].area) {
        largestDissolvedFeatures[zone] = {
          area: featureArea,
          feature,
        };
      }
    });
    const cleanDissolvedFeatures = Object.values(largestDissolvedFeatures).map(f => f.feature);
    const centroids: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: cleanDissolvedFeatures.map(f => {
        const center = centerOfMass(f);
        const zone = this.zoneAssignments[f.properties?.path];
        const geometry =
          pointsWithinPolygon(center, f as any).features.length === 1
            ? center.geometry
            : pointOnFeature(f).geometry;

        return {
          type: 'Feature',
          properties: {
            zone,
          },
          geometry,
        } as GeoJSON.Feature<GeoJSON.Point>;
      }),
    };
    return {
      centroids,
      dissolved,
    };
  },
  getCentroidBoilerplate(bounds) {
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const visitedZones = new Set<number>();
    const centroids: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: [],
    };
    const dissolved: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const bboxGeom: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat],
        ],
      ],
    };
    return {
      centroids,
      dissolved,
      visitedZones,
      bboxGeom,
    };
  },
  async getCentersOfMass(bounds, activeZones) {
    const {centroids, dissolved} = this.getCentroidBoilerplate(bounds);
    if (!activeZones.length) {
      return {
        centroids,
        dissolved,
      };
    }
    const clippedFeatures: Record<number, GeoJSON.Feature[]> = {};
    this.getGeos().features.forEach((f, i) => {
      const zone = this.zoneAssignments[f.properties?.path];
      if (zone === null || zone === undefined) return;
      const clipped = bboxClip(f.geometry as GeoJSON.Polygon, bounds);
      if (clipped.geometry?.coordinates.length) {
        if (!clippedFeatures[zone]) {
          clippedFeatures[zone] = [];
        }
        clippedFeatures[zone].push({
          ...f,
          geometry: clipped.geometry,
        });
      }
    });
    const centers = await Promise.all(
      Object.entries(clippedFeatures).map(async ([_zone, features]) => {
        const zone = +_zone
        const center = await computeCenterOfMass(
          {
            type: 'FeatureCollection',
            features: features as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
          },
          bounds
        );
        if (!center) return null;
        return {
            type: 'Feature',
            properties: {zone},
            geometry: {
              type: 'Point',
              coordinates: center,
            },
          } as GeoJSON.Feature<GeoJSON.Point>
      })
    );

    centers.forEach(c => {
      if (c) {
        centroids.features.push(c);
      }
    });
    return {
      centroids,
      dissolved,
    };
  },
  async getNonCollidingRandomCentroids(bounds, activeZones, minBuffer) {
    const {centroids, dissolved, visitedZones, bboxGeom} = this.getCentroidBoilerplate(bounds);
    if (!activeZones.length) {
      return {
        centroids,
        dissolved,
      };
    }
    const minimumDistance = minBuffer ?? CENTROID_BUFFER_KM;

    // re-use previous centroids if possible
    Object.entries(this.previousCentroids).forEach(([zone, previousCentroid]) => {
      const previousCentroidId = previousCentroid.properties?.id;
      if (!previousCentroidId) return;
      const currentZone = this.zoneAssignments[previousCentroidId];
      const zoneChanged = currentZone !== +zone && activeZones.includes(currentZone);
      // if this geo was erased or change the zone, do not re-use it
      if (currentZone === null || zoneChanged) {
        return;
      }
      // check if within current view
      const geoIsWithinView = booleanWithin(previousCentroid, bboxGeom);
      if (!geoIsWithinView) {
        return;
      }
      try {
        // check if it intersects with any other centroid given the new view
        const intersectsAny = centroids.features.some(pointFeature => {
          const distanceBetween = distance(previousCentroid, pointFeature, {units: 'kilometers'});
          return distanceBetween < minimumDistance;
        });
        if (intersectsAny) {
          return;
        }
        centroids.features.push(previousCentroid);
        visitedZones.add(+zone);
      } catch (e) {}
    });
    // randomly sort the active geometries to avoid bias
    const keys = Object.keys(this.activeGeometries).sort(() => Math.random() - 0.5);
    for (let i = 0; i < keys.length; i++) {
      // once every zone has a point, break the loop
      if (activeZones.every(zone => visitedZones.has(zone))) break;
      const key = keys[i];
      const f = this.activeGeometries[key];
      const zone = this.zoneAssignments[key];
      const zoneExists = zone !== null && zone !== undefined;
      const zoneIsNeeded = !visitedZones.has(zone) && activeZones.includes(zone);
      const zoneGeoIsPolygon = f.geometry.type == 'Polygon';
      if (!zoneExists || !zoneIsNeeded || !zoneGeoIsPolygon) continue;
      const geoIsWithinView = booleanWithin(f, bboxGeom);
      if (!geoIsWithinView) continue;
      try {
        let centroid = centerOfMass(f);
        const intersectsAny = Object.entries(this.previousCentroids).some(
          ([cZone, prevCentroid]) => {
            if (+zone === +cZone || !prevCentroid || !cZone) return false;
            const distanceBetween = distance(centroid, prevCentroid, {units: 'kilometers'});
            return distanceBetween < minimumDistance;
          }
        );
        // if it intersects with any other centroid of the current view, skip
        if (intersectsAny) continue;
        centroid.properties = {zone, id: key};
        // @ts-ignore
        centroids.features.push(centroid);
        visitedZones.add(zone);
        this.previousCentroids[zone] = centroid;
      } catch (e) {
        console.log(e);
      }
    }
    return {
      centroids,
      dissolved,
    };
  },
  async getCentroidsFromView({
    bounds,
    activeZones,
    strategy = 'non-colliding-centroids',
    minBuffer,
  }) {
    switch (strategy) {
      case 'center-of-mass':
        return await this.getCentersOfMass(bounds, activeZones);
      case 'non-colliding-centroids':
        return await this.getNonCollidingRandomCentroids(bounds, activeZones, minBuffer);
      default:
        return await this.getNonCollidingRandomCentroids(bounds, activeZones);
    }
  },
  getPropertiesCentroids(ids) {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

    ids.forEach(id => {
      const f = this.geometries[id];
      if (f) {
        let center = centerOfMass(f);
        center.properties = f.properties;
        features.push(center);
      } else {
        console.log('Could not find geography', id);
      }
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  },
  async getUnassignedGeometries(documentId?: string, exclude_ids?: string[]) {
    const geomsToDissolve: GeoJSON.Feature[] = [];
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/unassigned`);
    if (exclude_ids?.length) {
      exclude_ids.forEach(id => url.searchParams.append('exclude_ids', id));
    }
    const remoteUnassignedFeatures = await fetch(url).then(r => r.json());
    remoteUnassignedFeatures.features.forEach((geo: GeoJSON.MultiPolygon | GeoJSON.Polygon) => {
      if (geo.type === 'Polygon') {
        geomsToDissolve.push({
          type: 'Feature',
          properties: {},
          geometry: geo,
        });
      } else if (geo.type === 'MultiPolygon') {
        const polygons = explodeMultiPolygonToPolygons(geo);
        polygons.forEach(p => geomsToDissolve.push(p));
      }
    });

    if (!geomsToDissolve.length) {
      return {dissolved: {type: 'FeatureCollection', features: []}, overall: null};
    }
    let dissolved = dissolve({
      type: 'FeatureCollection',
      features: geomsToDissolve as GeoJSON.Feature<GeoJSON.Polygon>[],
    });

    const overall = bbox(dissolved) as LngLatBoundsLike;

    for (let i = 0; i < dissolved.features.length; i++) {
      const geom = dissolved.features[i].geometry;
      dissolved.features[i].properties = {
        ...(dissolved.features[i].properties || {}),
        bbox: bbox(geom),
        minX: geom.coordinates[0][0][0],
        minY: geom.coordinates[0][0][1],
      };
    }
    // sort by minX and minY
    dissolved.features = dissolved.features.sort((a, b) => {
      if (a.properties!.minY > b.properties!.minY) return -1;
      if (a.properties!.minX < b.properties!.minX) return 1;
      return 0;
    });

    return {
      dissolved,
      overall,
    };
  },
};

expose(GeometryWorker);
