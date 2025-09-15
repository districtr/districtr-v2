import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {ParquetWorker} from '@/app/utils/ParquetWorker/parquetWorker';

const parquetWorker = ParquetWorker;
// request will have mapDocument and brokenIds
interface RequestBody {
  mapDocument: DocumentObject;
  brokenIds: string[];
}
export const POST = async (request: Request) => {
  const {mapDocument, brokenIds} = await request.json();
  const demography = await parquetWorker.getDemography(mapDocument, brokenIds);
  return new Response(JSON.stringify(demography), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
