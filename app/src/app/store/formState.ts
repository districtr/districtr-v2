import {create} from 'zustand';
import {CommentCreate, CommenterCreate} from '../utils/api/apiHandlers/types';
import {postComment} from '../utils/api/mutations/postComment';
import {createJSONStorage, persist} from 'zustand/middleware';

export interface FormState {
  formRef: React.RefObject<HTMLFormElement> | null;
  setFormRef: (ref: React.RefObject<HTMLFormElement>) => void;
  formIsValid: boolean;
  highlightErrors: boolean;
  setHighlightErrors: (highlight: boolean) => void;
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
  submitForm: () => Promise<void>;
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
  recaptchaToken: string;
  setRecaptchaToken: (token: string) => void;
  checkFormValidity: () => void;
}

export const useFormState = create<FormState>()(
  persist(
    (set, get) => ({
      highlightErrors: false,
      setHighlightErrors: (highlight: boolean) => {
        set({highlightErrors: highlight});
      },
      formRef: null,
      setFormRef: (ref: React.RefObject<HTMLFormElement>) => {
        set({formRef: ref});
      },
      formIsValid: false,
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
        const {checkFormValidity} = get();
        set({
          acknowledgement: {...get().acknowledgement, [id]: acknowledged},
        });
        setTimeout(() => {
          checkFormValidity();
        }, 100);
      },
      setFormState: (formPart, formProperty, value) => {
        const {checkFormValidity} = get();
        set({
          [formPart]: {
            ...get()[formPart],
            [formProperty]: value?.trim()?.length ? value : undefined,
          },
        });
        checkFormValidity();
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
      submitForm: async () => {
        const {
          clear,
          setIsSubmitting,
          isSubmitting,
          comment,
          commenter,
          tags,
          acknowledgement,
          recaptchaToken,
        } = get();
        if (isSubmitting) {
          return;
        }
        setIsSubmitting(true);
        if (!Object.values(acknowledgement).every(Boolean)) {
          set({error: 'Please acknowledge all statements'});
          return;
        }
        // clean up to just document ID
        const cleanDocumentId = comment.document_id?.trim()?.length
          ? comment.document_id.split('/').pop()?.replace('?pw=true', '')
          : null;
        //  todo, some validation
        const response = await postComment.mutate({
          comment: {
            ...comment,
            document_id: cleanDocumentId,
          } as CommentCreate,
          commenter: commenter as CommenterCreate,
          tags: Array.from(tags).map(tag => ({tag})),
          recaptcha_token: recaptchaToken,
        });
        set({
          recaptchaToken: '',
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
          formIsValid: false,
          recaptchaToken: '',
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
      recaptchaToken: '',
      setRecaptchaToken: (token: string) => {
        const {checkFormValidity} = get();
        set({
          recaptchaToken: token,
        });
        checkFormValidity();
      },
      checkFormValidity: () => {
        const formRef = get().formRef;
        set({formIsValid: Boolean(formRef?.current?.checkValidity() ?? false)});
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
