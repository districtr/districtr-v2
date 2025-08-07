'use client';

import {ContentHeader} from '@/app/components/Static/ContentHeader';
import {useFormState} from '@/app/store/formState';
import {Blockquote, Box, Button, Flex, Spinner, TextArea} from '@radix-ui/themes';
import {AcknowledgementField} from './AcknowledgementField';
import {FormField} from './FormField';
import {CommentFormTagSelector} from './CommentFormTagSelector';
import {MapSelector} from './MapSelector';
import {useRecaptcha} from '@/app/hooks/useRecaptcha';

export const CommentSubmissionForm: React.FC<{
  mandatoryTags: string[];
  allowListModules: string[];
}> = ({mandatoryTags, allowListModules}) => {
  const submitForm = useFormState(state => state.submitForm);
  const {RecaptchaComponent, recaptchaToken} = useRecaptcha();
  const isSubmitting = useFormState(state => state.isSubmitting);
  const success = useFormState(state => state.success);
  const clearForm = useFormState(state => state.clear);

  return (
    <Box p="4" className="relative">
      {success && (
        <Blockquote color="green" className="mb-4">
          {success}
        </Blockquote>
      )}
      {isSubmitting && (
        <Flex className="absolute inset-0 bg-white/75 z-10" justify="center" align="center">
          <Spinner size="3" />
        </Flex>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          if (recaptchaToken) {
            submitForm(recaptchaToken);
          }
        }}
      >
        <Flex direction="column" gap="4">
          <ContentHeader title="Submission Title" />
          <FormField
            formPart="comment"
            formProperty="title"
            label="Submission Title *"
            type="text"
            required={true}
          />
          <FormField
            formPart="comment"
            formProperty="comment"
            label="Testimony *"
            type="text"
            component={TextArea}
            required={true}
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
                formPart="commenter"
                formProperty="salutation"
                label="Salutation *"
                type="text"
                autoComplete="honorific-prefix"
                required={true}
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                formPart="commenter"
                formProperty="first_name"
                label="First Name (or identifier) *"
                type="text"
                autoComplete="given-name"
                required={true}
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                formPart="commenter"
                formProperty="last_name"
                label="Last Name"
                type="text"
                autoComplete="family-name"
              />
            </Box>
          </Flex>
          <FormField
            formPart="commenter"
            formProperty="email"
            label="Email *"
            type="email"
            autoComplete="email"
            required={true}
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
                formPart="commenter"
                formProperty="place"
                label="City/County (optional but encouraged)"
                type="text"
                autoComplete="address-level2"
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                formPart="commenter"
                formProperty="state"
                label="State *"
                type="text"
                autoComplete="address-level1"
                required={true}
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                formPart="commenter"
                formProperty="zip_code"
                label="Zip Code *"
                type="text"
                autoComplete="postal-code"
                required={true}
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
              className="w-min"
              size="4"
              color="green"
              disabled={!recaptchaToken}
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
