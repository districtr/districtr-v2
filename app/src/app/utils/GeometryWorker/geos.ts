import {Geometry, MultiPolygon, GeometryCollection} from 'wkx';
import initGeosJs, {type geos as GeosType} from 'geos-wasm';

class Geos {
  geos: GeosType | null = null;

  async getGeos() {
    if (!this.geos) {
      this.geos = await initGeosJs();
    }
    return this.geos;
  }
  async ingest(data: GeoJSON.Geometry) {
    const geos = await this.getGeos();
    return this.ingestSync(geos, data);
  }
  ingestSync(geos: GeosType, data: GeoJSON.Geometry) {
    let featureWkb: any = Geometry.parseGeoJSON(data).toWkb();
    const featuresWkbPtr = geos.Module._malloc(featureWkb.length);
    geos.Module.HEAPU8.set(featureWkb, featuresWkbPtr);
    const geomPtr = geos.GEOSGeomFromWKB_buf(featuresWkbPtr, featureWkb.length);
    geos.GEOSFree(featuresWkbPtr);
    return geomPtr;
  }
  async export(pointer: number, format: Array<'buffer' | 'wkx' | 'wkb' | 'geojson'>) {
    const geos = await this.getGeos();
    return this.exportSync(geos, pointer, format);
  }
  exportSync(geos: GeosType, pointer: number, format: Array<'buffer' | 'wkx' | 'wkb' | 'geojson'>) {
    const wkbPtrLength = geos.Module._malloc(4);
    // @ts-expect-error expects string instead of number
    geos.Module.setValue(wkbPtrLength, 0, 'i32');
    // get the wkbPtr and store its length in wkbPtrLength
    const wkbPtr = geos.GEOSGeomToWKB_buf(pointer, wkbPtrLength);
    // get the actual length from wkbPtrLength
    const size = geos.Module.getValue(wkbPtrLength, 'i32');
    // create a Uint8Array from the wkbPtr and the size
    const wkbView = new Uint8Array(geos.Module.HEAPU8.buffer, wkbPtr, size);
    const wkb = new Uint8Array(wkbView);
    // free the memory
    geos.GEOSFree(wkbPtr);
    geos.GEOSFree(wkbPtrLength);
    const buffer = Buffer.from(wkb);
    const parsed = Geometry.parse(buffer);

    const output: {
      buffer?: Buffer;
      wkx?: Geometry;
      geojson?: GeoJSON.Geometry | any;
      wkb?: Buffer;
    } = {};

    format.forEach(f => {
      switch (f) {
        case 'buffer':
          output['buffer'] = buffer;
        case 'wkx':
          output['wkx'] = parsed;
        case 'wkb':
          output['wkb'] = parsed.toWkb();
        case 'geojson':
          output['geojson'] = parsed.toGeoJSON();
      }
    });

    return output;
  }
}

export const geosManager = new Geos();
