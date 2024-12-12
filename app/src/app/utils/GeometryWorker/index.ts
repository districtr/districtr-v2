
import { wrap } from 'comlink';
import {GeometryWorkerClass} from './geometryWorker.types';

const worker =
  typeof Worker !== 'undefined'
    ? new Worker(new URL('./geometryWorker.ts', import.meta.url))
    : null;

const GeometryWorker = worker ? wrap<GeometryWorkerClass>(worker) : null;

export default GeometryWorker;