'use client';
import {ContentHeader} from '@/app/components/Static/ContentHeader';
import {useFormState} from '@/app/store/formState';
import {Blockquote, Box, Button, Dialog, Flex, Select, Spinner, TextArea} from '@radix-ui/themes';
import {AcknowledgementField} from './AcknowledgementField';
import {FormField} from './FormField';
import {CommentFormTagSelector} from './CommentFormTagSelector';
import {MapSelector} from './MapSelector';
import {useRecaptcha} from '@/app/hooks/useRecaptcha';
import {VALID_STATES_LABELS} from './constants';
import { useLayoutEffect, useRef } from 'react';

export const CommentSubmissionForm: React.FC<{
  disabled?: boolean;
  mandatoryTags: string[];
  allowListModules: string[];
}> = ({disabled, mandatoryTags, allowListModules}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const setFormRef = useFormState(state => state.setFormRef);
  const formIsValid = useFormState(state => state.formIsValid);

  const submitForm = useFormState(state => state.submitForm);
  const {RecaptchaComponent, recaptchaToken} = useRecaptcha();
  
  const isSubmitting = useFormState(state => state.isSubmitting);
  
  const success = useFormState(state => state.success);
  const setSuccess = useFormState(state => state.setSuccess);

  const error = useFormState(state => state.error);
  const setError = useFormState(state => state.setError);
  
  const clearForm = useFormState(state => state.clear);
  
  const setHighlightErrors = useFormState(state => state.setHighlightErrors);

  useLayoutEffect(() => {
    setFormRef(formRef);
  }, [formRef]);  

  return (
    <Box p="4" className="relative">
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
          if (recaptchaToken && formIsValid) {
            submitForm(recaptchaToken);
          }
        }}
        ref={formRef}
      >
        <Flex direction="column" gap="4">
          <ContentHeader title="Add Your Comment" />
          <FormField
            disabled={disabled}
            formPart="comment"
            formProperty="title"
            label="Submission Title *"
            type="text"
            required={true}
            invalidMessage="Enter a submission title"
          />
          <FormField
            disabled={disabled}
            formPart="comment"
            formProperty="comment"
            label="Testimony *"
            type="text"
            component={TextArea}
            required={true}
            invalidMessage="Enter your testimony"
          />
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
          <ContentHeader title="Tell us about yourself" />
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
            width="100%"
          >
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="salutation"
                label="Salutation *"
                type="text"
                autoComplete="honorific-prefix"
                required={true}
                invalidMessage="Enter a salutation"
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="first_name"
                label="First Name (or identifier) *"
                type="text"
                autoComplete="given-name"
                required={true}
                invalidMessage="Enter your first name or identifier"
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="last_name"
                label="Last Name"
                type="text"
                autoComplete="family-name"
              />
            </Box>
          </Flex>
          <FormField
            disabled={disabled}
            formPart="commenter"
            formProperty="email"
            label="Email *"
            type="email"
            autoComplete="email"
            required={true}
            invalidMessage="Enter a valid email address"
          />
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
            width="100%"
          >
            <Box flexGrow="1" flexBasis="60%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="place"
                label="City/County (optional but encouraged)"
                type="text"
                autoComplete="address-level2"
                invalidMessage="Enter a city or county"
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="state"
                label="State *"
                type="text"
                autoComplete="address-level1"
                required={true}
                component={Select.Root}
                options={VALID_STATES_LABELS}
                invalidMessage="Select a state"
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                disabled={disabled}
                formPart="commenter"
                formProperty="zip_code"
                label="Zip Code *"
                type="text"
                autoComplete="postal-code"
                required={true}
                pattern="[0-9]{5}"
                validator={value => /[0-9]{5}/.test(value ?? '')}
                invalidMessage="Please enter a valid 5-digit zip code"
              />
            </Box>
          </Flex>
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
          {RecaptchaComponent}
          <Flex direction="row" gap="4" justify="between" align="center">
            <Button
              type="submit"
              size="4"
              color={!recaptchaToken || !formIsValid ? 'gray' : 'green'}
              className={`${!recaptchaToken || !formIsValid ? 'cursor-not-allowed opacity-50' : ''} w-min`}
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
