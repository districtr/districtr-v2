import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {postFullCommentForm} from '../apiHandlers/postFullCommentForm';

export const postComment = new MutationObserver(queryClient, {
  mutationFn: postFullCommentForm,
  onMutate: () => {
    console.log('Creating comment');
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
});
