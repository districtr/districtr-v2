import axios from 'axios';
import {DocumentObject, MinPublicDocument} from './types';

export const getPlans = async ({
  ids,
  tags,
  limit,
  offset,
}: {
  ids?: number[];
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<MinPublicDocument[] | null> => {
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/list`);

  if (ids) {
    ids.forEach(id => {
      url.searchParams.append('ids', id.toString());
    });
  } else if (tags) {
    tags.forEach(tag => {
      url.searchParams.append('tags', tag);
    });
  }

  if (limit) {
    url.searchParams.set('limit', limit.toString());
  }

  if (offset) {
    url.searchParams.set('offset', offset.toString());
  }

  return await axios.get(url.toString()).then(res => {
    return res.data;
  });
};
