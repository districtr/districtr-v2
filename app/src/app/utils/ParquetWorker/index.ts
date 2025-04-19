import {wrap} from 'comlink';
import {ParquetWorkerClass} from './parquetWorker.types';

/**
 * Creates a new Web Worker for handling geometry-related tasks if the `Worker`
 * global is available. The worker is instantiated using the `geometryWorker.ts`
 * script located in the same directory as the current module.
 *
 * @constant
 * @type {(Worker | null)}
 *
 * @remarks
 * - The `Worker` global is checked to ensure that the environment supports Web Workers.
 * - The `new URL('./geometryWorker.ts', import.meta.url)` syntax is used to generate
 *   a URL for the worker script relative to the current module.
 * - If `Worker` is not available (e.g., in a non-browser environment), `worker` is set to `null`.
 */
const worker =
  typeof Worker !== 'undefined' ? new Worker(new URL('./parquetWorker.ts', import.meta.url)) : null;

const ParquetWorker = worker ? wrap<ParquetWorkerClass>(worker) : null;

export default ParquetWorker;
