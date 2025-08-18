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
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
  tags: string[];
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
  showMapSelector: boolean;
  setShowMapSelector: (show: boolean) => void;
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
      isSubmitting: false,
      setIsSubmitting: (isSubmitting: boolean) => {
        set({isSubmitting});
      },
      setAcknowledgement: (id: string, acknowledged: boolean) => {
        set({acknowledgement: {...get().acknowledgement, [id]: acknowledged}});
      },
      setFormState: (formPart, formProperty, value) => {
        set({
          [formPart]: {
            ...get()[formPart],
            [formProperty]: value?.trim()?.length ? value : undefined,
          },
        });
      },
      setTags: (tag: string, action: 'add' | 'remove') => {
        const {tags} = get();
        const tagsIsArray = Array.isArray(tags);
        let newTags = tagsIsArray ? [...(tags ?? [])] : new Array<string>();
        switch (action) {
          case 'add':
            newTags.push(tag);
            break;
          case 'remove':
            newTags = newTags.filter(t => t !== tag);
            break;
        }
        set({tags: Array.from(new Set(newTags))});
      },
      tags: new Array<string>(),
      error: '',
      success: '',
      submitForm: async recaptchaToken => {
        const {clear, setIsSubmitting, isSubmitting} = get();
        if (isSubmitting) {
          return;
        }
        setIsSubmitting(true);
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
        set({
          isSubmitting: false,
          success: response.ok ? 'Comment submitted successfully' : undefined,
          error: response.ok ? undefined : response.error,
        });
        if (response.ok) {
          clear();
        }
      },
      clear: () => {
        set({
          comment: {},
          commenter: {},
          tags: new Array<string>(),
          acknowledgement: {},
          showMapSelector: false,
        });
      },
      setError: (error: string) => {
        set({error});
      },
      setSuccess: (success: string) => {
        set({success});
      },
      showMapSelector: false,
      setShowMapSelector: (show: boolean) => {
        set({showMapSelector: show});
      },
    }),
    {
      name: 'form-state',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        comment: state.comment,
        commenter: state.commenter,
        tags: state.tags,
        acknowledgement: state.acknowledgement,
        showMapSelector: state.showMapSelector,
      }),
    }
  )
);
