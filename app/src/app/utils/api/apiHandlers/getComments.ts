import {get} from '../factory';
export interface CommentListing {
  title: string;
  comment: string;
  first_name: string;
  last_name: string;
  place: string;
  state: string;
  zip_code: string;
  created_at: Date;
  tags?: string[];
}
export interface CommentFilters {
  ids?: number[];
  tags?: string[];
  place?: string;
  state?: string;
  zipCode?: string;
  offset?: number;
  limit?: number;
}

export const getPublicComments = async (filters: CommentFilters) => {
  const searchParams = new URLSearchParams();

  if (filters.ids) {
    filters.ids.forEach(id => {
      searchParams.append('ids', id.toString());
    });
  } else if (filters.tags) {
    filters.tags.forEach(tag => {
      searchParams.append('tags', tag);
    });
  }

  if (filters.place) {
    searchParams.append('place', filters.place);
  }
  if (filters.state) {
    searchParams.append('state', filters.state);
  }
  if (filters.zipCode) {
    searchParams.append('zipCode', filters.zipCode);
  }
  if (filters.offset) {
    searchParams.append('offset', filters.offset.toString());
  }
  if (filters.limit) {
    searchParams.append('limit', filters.limit.toString());
  }

  const queryString = searchParams.toString();
  const path = `comments/list${queryString ? `?${queryString}` : ''}`;
  return await get<CommentListing[]>(path)({});
};
