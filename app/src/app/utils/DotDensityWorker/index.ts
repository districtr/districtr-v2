import {wrap} from 'comlink';
import type {DotDensityWorkerClass} from './dotDensityWorker.types';

const worker =
  typeof Worker !== 'undefined'
    ? new Worker(new URL('./dotDensityWorker.ts', import.meta.url))
    : null;

const DotDensityWorker = worker ? wrap<DotDensityWorkerClass>(worker) : null;

export default DotDensityWorker;
