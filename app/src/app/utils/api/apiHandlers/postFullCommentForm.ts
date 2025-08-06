import {post} from '../factory';
import {FullCommentForm, FullCommentFormResponse} from './types';

export const postFullCommentForm = async (formData: FullCommentForm) => {
  const response = await post<FullCommentForm, FullCommentFormResponse>('comments/submit')({
    body: formData,
  });

  if (!response.ok) {
    throw new Error(response.error.detail);
  }

  return response.response;
};
