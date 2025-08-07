import {create} from 'zustand';
import {CommentCreate, CommenterCreate} from '../utils/api/apiHandlers/types';
import {postComment} from '../utils/api/mutations/postComment';
import {createJSONStorage, persist} from 'zustand/middleware';

export interface FormState {
  comment: Partial<CommentCreate>;
  commenter: Partial<CommenterCreate>;
  setFormState: <T extends 'comment' | 'commenter'>(
    formPart: T,
    formProperty: keyof FormState[T],
    value: string
  ) => void;
  tags: Set<string>;
  setTags: (tag: string, action: 'add' | 'remove') => void;
  submitForm: (recaptchaToken: string) => Promise<void>;
  clear: () => void;
  error: string;
  setError: (error: string) => void;
  success: string;
  setSuccess: (success: string) => void;
  acknowledgement: {
    [key: string]: boolean;
  };
  setAcknowledgement: (id: string, acknowledged: boolean) => void;
}

export const useFormState = create<FormState>()(
  persist(
    (set, get) => ({
      comment: {
        title: '',
        comment: '',
      },
      commenter: {
        first_name: '',
        email: '',
        salutation: '',
        state: '',
        zip_code: '',
      },
      acknowledgement: {},
      setAcknowledgement: (id: string, acknowledged: boolean) => {
        set({acknowledgement: {...get().acknowledgement, [id]: acknowledged}});
      },
      setFormState: (formPart, formProperty, value) => {
        set({
          [formPart]: {
            ...get()[formPart],
            [formProperty]: value,
          },
        });
      },
      setTags: (tag: string, action: 'add' | 'remove') => {
        const {tags} = get();
        const newTags = new Set([...Array.from(tags)]);
        switch (action) {
          case 'add':
            newTags.add(tag);
            break;
          case 'remove':
            newTags.delete(tag);
            break;
        }
        set({tags: newTags});
      },
      tags: new Set(),
      error: '',
      success: '',
      submitForm: async recaptchaToken => {
        const {comment, commenter, tags, acknowledgement} = useFormState.getState();
        if (!Object.values(acknowledgement).every(Boolean)) {
          set({error: 'Please acknowledge all statements'});
          return;
        }
        //  todo, some validation
        const response = await postComment.mutate({
          comment: comment as CommentCreate,
          commenter: commenter as CommenterCreate,
          tags: Array.from(tags).map(tag => ({tag})),
          recaptcha_token: recaptchaToken,
        });
        console.log(response);
      },
      clear: () => {
        set({
          comment: {},
          commenter: {},
          tags: new Set(),
          acknowledgement: {},
        });
      },
      setError: (error: string) => {
        set({error});
      },
      setSuccess: (success: string) => {
        set({success});
      },
    }),
    {
      name: 'form-state',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
