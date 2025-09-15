import {ParquetWorker} from '@/app/utils/ParquetWorker/parquetWorker';

const parquetWorker = ParquetWorker;
// request will have mapDocument and brokenIds
interface RequestBody {
  layer: string;
  columns: string[];
  source: string;
  filterIds?: Set<string>;
}
export const POST = async (request: Request) => {
  const {layer, columns, source, filterIds} = await request.json();
  const pointsData = await parquetWorker.getPointData(layer, columns, source, filterIds);
  return new Response(JSON.stringify(pointsData), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
