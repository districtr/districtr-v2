'use client';
import {ContentHeader} from '@/app/components/Static/ContentHeader';
import {useFormState} from '@/app/store/formState';
import {Blockquote, Box, Button, Dialog, Flex, Spinner, TextArea} from '@radix-ui/themes';
import {AcknowledgementField} from './AcknowledgementField';
import {FormField} from './FormField';
import {CommentFormTagSelector} from './CommentFormTagSelector';
import {MapSelector} from './MapSelector';
import {useTurnstile} from '@/app/hooks/useTurnstile';
import {useLayoutEffect, useRef} from 'react';
import {FIELD_ORDER, FIELD_REGISTRY} from './fieldRegistry';

export interface CustomFieldSpec {
  key: string;
  label: string;
  fieldType: 'text' | 'textarea';
  required: boolean;
}

export interface SubmissionFormProps {
  disabled?: boolean;
  /** The portal this form submits to (injected by the CMS content API). */
  portalId?: string | null;
  /** The portal's collection mode (informational here; the form block only
   * appears on prompt/form portals in practice). */
  collectionMode?: string | null;
  /** Registry field names this portal's form shows; null = no form config. */
  fields?: string[] | null;
  requiredFields?: string[] | null;
  requireEmailConfirm?: boolean;
  /** Admin-defined questions beyond the registry (answers are public). */
  customFields?: CustomFieldSpec[] | null;
  mandatoryTags: string[];
  allowListModules: string[] | null;
}

/**
 * The portal submission form, rendered from the portal's form config
 * (fieldRegistry.tsx is the field vocabulary). A portal without a config
 * renders nothing — the wizard always creates one.
 */
export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  disabled,
  portalId,
  fields,
  requiredFields,
  requireEmailConfirm,
  customFields,
  mandatoryTags,
  allowListModules,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const setFormRef = useFormState(state => state.setFormRef);
  const formIsValid = useFormState(state => state.formIsValid);

  const submitForm = useFormState(state => state.submitForm);
  const {TurnstileComponent, captchaToken} = useTurnstile();

  const isSubmitting = useFormState(state => state.isSubmitting);

  const success = useFormState(state => state.success);
  const setSuccess = useFormState(state => state.setSuccess);

  const error = useFormState(state => state.error);
  const setError = useFormState(state => state.setError);

  const clearForm = useFormState(state => state.clear);

  const setHighlightErrors = useFormState(state => state.setHighlightErrors);
  const emailValue = useFormState(state => state.fields['email'] ?? '');
  const emailConfirm = useFormState(state => state.emailConfirm);
  const setEmailConfirm = useFormState(state => state.setEmailConfirm);

  useLayoutEffect(() => {
    setFormRef(formRef);
  }, [formRef]);

  if (!portalId || !fields) {
    // No form config for this portal (or a form block on a non-portal page).
    return null;
  }

  const required = new Set(requiredFields ?? []);
  const shown = FIELD_ORDER.filter(name => fields.includes(name));
  // Registry drift (a config field this frontend build doesn't know) would
  // otherwise render no input while the backend keeps requiring it — an
  // unsubmittable form with no visible cause.
  const unknown = fields.filter(name => !(name in FIELD_REGISTRY));
  if (unknown.length) {
    console.warn(
      `SubmissionForm: unknown field(s) in portal config: ${unknown.join(', ')} — ` +
        'update fieldRegistry.tsx (3-file lockstep with backend fields.py and ' +
        'the CMS SUBMISSION_FIELD_CHOICES).'
    );
  }
  const submissionFields = shown.filter(name => FIELD_REGISTRY[name].section === 'submission');
  const aboutFields = shown.filter(name => FIELD_REGISTRY[name].section === 'about');

  const renderCustomField = (spec: CustomFieldSpec) => (
    <Box key={spec.key} flexGrow="1">
      <FormField
        disabled={disabled}
        name={spec.key}
        label={`${spec.label}${spec.required ? ' *' : ''}`}
        type="text"
        component={spec.fieldType === 'textarea' ? TextArea : undefined}
        required={spec.required}
      />
    </Box>
  );

  const renderField = (name: string) => {
    const spec = FIELD_REGISTRY[name];
    return (
      <Box key={name} flexGrow="1">
        <FormField
          disabled={disabled}
          name={name}
          label={`${spec.label}${required.has(name) ? ' *' : ''}`}
          type={spec.type}
          component={spec.component}
          options={spec.options}
          autoComplete={spec.autoComplete}
          pattern={spec.pattern}
          validator={spec.validator}
          required={required.has(name)}
          invalidMessage={spec.invalidMessage}
        />
        {name === 'email' && requireEmailConfirm && (
          <Box mt="2">
            <FormField
              disabled={disabled}
              name="email_confirm"
              label="Confirm Email *"
              type="email"
              required={true}
              value={emailConfirm}
              onChangeValue={setEmailConfirm}
              validator={value => value === emailValue}
              invalidMessage="Email addresses must match"
            />
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box py="4" className="relative">
      {success && (
        <Blockquote color="green" className="mb-4">
          {success}
        </Blockquote>
      )}
      <Dialog.Root open={!!error || !!success}>
        <Dialog.Content>
          <Dialog.Title>{error ? 'Error' : 'Success'}</Dialog.Title>
          <Dialog.Description>{error || success}</Dialog.Description>
          <Dialog.Close>
            <Button
              variant="ghost"
              color={error ? 'red' : 'green'}
              className="mt-4"
              onClick={() => {
                setError('');
                setSuccess('');
              }}
            >
              Dismiss
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Root>
      {isSubmitting && (
        <Flex className="absolute inset-0 bg-white/75 z-10" justify="center" align="center">
          <Spinner size="3" />
        </Flex>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          // checkValidity() only sees native constraints, so the confirm
          // field's match rule must be enforced here — otherwise
          // require_email_confirm degrades to "type anything twice".
          const emailConfirmed =
            !requireEmailConfirm || (shown.includes('email') && emailConfirm === emailValue);
          if (captchaToken && formIsValid && emailConfirmed) {
            submitForm(portalId, shown);
          }
        }}
        ref={formRef}
      >
        <Flex direction="column" gap="4">
          <ContentHeader title="Add Your Comment" />
          {submissionFields.map(renderField)}
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
          >
            <CommentFormTagSelector mandatoryTags={mandatoryTags} />
            <MapSelector allowListModules={allowListModules} />
          </Flex>
          {aboutFields.length > 0 && <ContentHeader title="Tell us about yourself" />}
          <Flex direction="column" gap="4" width="100%">
            {aboutFields.map(renderField)}
          </Flex>
          {(customFields?.length ?? 0) > 0 && (
            <Flex direction="column" gap="4" width="100%">
              {customFields!.map(renderCustomField)}
            </Flex>
          )}
          <Flex direction="column" gap="4">
            <Box flexGrow="1" flexBasis="60%">
              <AcknowledgementField
                id="comment-is-public"
                label="I understand that my public comment submission will be made available to the Commission and other members of the public."
              />
            </Box>
            <Box flexGrow="1" flexBasis="60%">
              <AcknowledgementField
                id="email-is-confidential"
                label="I understand that while this public comment submission is a public document, my email address will be kept confidential to the extent authorized by law."
              />
            </Box>
          </Flex>
          {TurnstileComponent}
          <Flex direction="row" gap="4" justify="between" align="center">
            <Button
              type="submit"
              size="4"
              color={!captchaToken || !formIsValid ? 'gray' : 'green'}
              className={`${!captchaToken || !formIsValid ? 'cursor-not-allowed opacity-50' : ''} w-min`}
              onMouseEnter={() => setHighlightErrors(true)}
              onMouseLeave={() => setHighlightErrors(false)}
            >
              Submit
            </Button>
            <Button
              type="button"
              className="w-min"
              size="2"
              variant="ghost"
              color="red"
              onClick={() => {
                clearForm();
              }}
            >
              Reset
            </Button>
          </Flex>
        </Flex>
      </form>
    </Box>
  );
};
