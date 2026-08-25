import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import {postSubmission} from '../utils/api/apiHandlers/postSubmission';
import {parseMapRef} from '../utils/map/editUrl';

export interface FormState {
  formRef: React.RefObject<HTMLFormElement> | null;
  setFormRef: (ref: React.RefObject<HTMLFormElement>) => void;
  formIsValid: boolean;
  highlightErrors: boolean;
  setHighlightErrors: (highlight: boolean) => void;
  /** Sparse field values keyed by registry field name (fieldRegistry.tsx). */
  fields: Record<string, string>;
  setField: (name: string, value: string) => void;
  /** Client-side email re-entry for portals with require_email_confirm. */
  emailConfirm: string;
  setEmailConfirm: (value: string) => void;
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
  tags: string[];
  setTags: (tag: string, action: 'add' | 'remove') => void;
  /** The pasted/selected map link; parsed to a document ref at submit. */
  mapRef: string;
  setMapRef: (mapRef: string) => void;
  submitForm: (portalId: string) => Promise<void>;
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
      fields: {},
      emailConfirm: '',
      setEmailConfirm: (value: string) => {
        const {checkFormValidity} = get();
        set({emailConfirm: value});
        checkFormValidity();
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
      setField: (name, value) => {
        const {checkFormValidity, fields} = get();
        const next = {...fields};
        if (value?.trim()?.length) {
          next[name] = value;
        } else {
          delete next[name];
        }
        set({fields: next});
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
      mapRef: '',
      setMapRef: (mapRef: string) => {
        const {checkFormValidity} = get();
        set({mapRef});
        checkFormValidity();
      },
      error: '',
      success: '',
      submitForm: async (portalId: string) => {
        const {
          clear,
          setIsSubmitting,
          isSubmitting,
          fields,
          tags,
          mapRef,
          showMapSelector,
          acknowledgement,
          captchaToken,
        } = get();
        if (isSubmitting) {
          return;
        }
        setIsSubmitting(true);
        if (!Object.values(acknowledgement).every(Boolean)) {
          set({error: 'Please acknowledge all statements', isSubmitting: false});
          return;
        }
        const response = await postSubmission({
          portal_id: portalId,
          fields,
          tags: Array.from(tags),
          map_ref: showMapSelector ? parseMapRef(mapRef) : null,
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
          fields: {},
          emailConfirm: '',
          tags: new Array<string>(),
          mapRef: '',
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
      // v2: comment/commenter split replaced by the sparse fields record.
      version: 2,
      partialize: state => ({
        fields: state.fields,
        tags: state.tags,
        mapRef: state.mapRef,
        acknowledgement: state.acknowledgement,
        showMapSelector: state.showMapSelector,
      }),
    }
  )
);
