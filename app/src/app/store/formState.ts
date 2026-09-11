import {create} from 'zustand';
import {CommentCreate, CommenterCreate} from '../utils/api/apiHandlers/types';
import {postComment} from '../utils/api/mutations/postComment';
import {createJSONStorage, persist} from 'zustand/middleware';
import {parseDocumentIdFromMapUrl} from '../utils/map/editUrl';

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
  // pathname the current tags belong to; tags reset when the form mounts on a different page
  tagsPageKey: string;
  resetTagsForPage: (pageKey: string) => void;
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
  captchaToken: string;
  setCaptchaToken: (token: string) => void;
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
      tagsPageKey: '',
      resetTagsForPage: (pageKey: string) => {
        if (get().tagsPageKey !== pageKey) {
          set({tagsPageKey: pageKey, tags: []});
        }
      },
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
          captchaToken,
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
          ? parseDocumentIdFromMapUrl(comment.document_id)
          : null;
        //  todo, some validation
        const response = await postComment.mutate({
          comment: {
            ...comment,
            document_id: cleanDocumentId,
          } as CommentCreate,
          commenter: commenter as CommenterCreate,
          tags: Array.from(tags).map(tag => ({tag})),
          turnstile_token: captchaToken,
        });
        set({
          captchaToken: '',
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
          captchaToken: '',
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
      captchaToken: '',
      setCaptchaToken: (token: string) => {
        const {checkFormValidity} = get();
        set({
          captchaToken: token,
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
        tagsPageKey: state.tagsPageKey,
        acknowledgement: state.acknowledgement,
        showMapSelector: state.showMapSelector,
      }),
    }
  )
);
