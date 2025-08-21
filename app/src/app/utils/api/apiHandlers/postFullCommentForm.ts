import {post} from '../factory';
import {FullCommentForm, FullCommentFormResponse} from './types';

export const postFullCommentForm = async (
  formData: FullCommentForm
): Promise<
  | {
      ok: true;
      data: FullCommentFormResponse;
    }
  | {
      ok: false;
      error: string;
    }
> => {
  const response = await post<FullCommentForm, FullCommentFormResponse>('comments/submit')({
    body: formData,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error.detail,
    };
  }

  return {
    ok: true,
    data: response.response,
  };
};
