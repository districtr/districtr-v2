import {patch} from '../factory';

export const patchUpdateReset = async (document_id: string) => {
  return await patch<
    object,
    {
      message: string;
      document_id: string;
    }
  >(`assignments/${document_id}/reset`)({});
};
