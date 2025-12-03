import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {postFullCommentForm} from '../apiHandlers/postFullCommentForm';

export const postComment = new MutationObserver(queryClient, {
  mutationFn: postFullCommentForm,
  onMutate: () => {
  },
  onError: error => {
  },
});
