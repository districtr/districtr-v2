import {DocumentObject} from './types';
import ParquetWorker from '../../ParquetWorker';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {AllTabularColumns} from '../summaryStats';
import {TOPOLOGY_VARIANT} from '../../topology/flag';
import {ensureShattered, topologyBaseFor} from '../../topology/state';

/** Topology prototype path; null means use the tabular parquet. */
const getTopologyDemography = async (mapDocument: DocumentObject, brokenIds: string[]) => {
  try {
    const topo = await ensureShattered(mapDocument, brokenIds);
    const base = topologyBaseFor(mapDocument);
    if (!topo || !base || !ParquetWorker) return null;
    return await ParquetWorker.getTopologyDemography(
      base,
      brokenIds,
      mapDocument.parent_layer,
      mapDocument.child_layer
    );
  } catch (error) {
    console.error('Topology demography failed; using the tabular parquet', error);
    return null;
  }
};

export const getDemography = async ({
  mapDocument,
  brokenIds,
}: {
  mapDocument?: DocumentObject;
  brokenIds?: string[];
}): Promise<{
  columns: AllTabularColumns[number][];
  results: ColumnarTableData;
}> => {
  if (!mapDocument) {
    throw new Error('No document id provided');
  }
  if (!ParquetWorker) {
    throw new Error('ParquetWorker not found');
  }
  if (TOPOLOGY_VARIANT) {
    const topologyData = await getTopologyDemography(mapDocument, brokenIds ?? []);
    if (topologyData) return topologyData;
  }
  const demographyData = await ParquetWorker.getDemography(mapDocument, brokenIds);
  return {
    columns: demographyData.columns,
    results: demographyData.results,
  };
};
