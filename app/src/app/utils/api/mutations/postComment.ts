import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {postFullCommentForm} from '../apiHandlers/postFullCommentForm';
import {FullCommentFormResponse} from '../apiHandlers/types';

export const postComment = new MutationObserver(queryClient, {
  mutationFn: postFullCommentForm,
  onMutate: () => {
    console.log('Creating comment');
  },
  onError: error => {
    console.log('Error updating assignments: ', error);
  },
  onSuccess: (_data: FullCommentFormResponse) => {
    console.log(`Successfully created comment`);
  },
});
