'use client';
import {useEffect, useMemo, useState} from 'react';
import {
  Blockquote,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useFormState} from '@/app/store/formState';
import {useDraftSubmissionStore} from '@/app/store/draftSubmissionStore';
import {getDraftSubmission, updateDraftSubmission} from '@/app/utils/draftSubmissions';
import {
  finalizeSubmission,
  getFormConfig,
  type FormConfigPublic,
} from '@/app/utils/api/apiHandlers/postSubmission';
import {FIELD_ORDER, FIELD_REGISTRY} from '@/app/components/Forms/fieldRegistry';
import {FormField} from '@/app/components/Forms/FormField';
import {useTurnstile} from '@/app/hooks/useTurnstile';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The abbreviated submission form for maps started from a portal: shown when
 * the user flips their map to ready-to-share (useMetadataChange opens it via
 * draftSubmissionStore), or from the Save & Share menu while the draft
 * exists. Only the portal's required fields are asked — the map and the
 * portal tag are implicit; finalizing clones the plan server-side so the
 * gallery entry is frozen.
 */
export const SubmitToPortalModal: React.FC = () => {
  const promptDocumentId = useDraftSubmissionStore(state => state.promptDocumentId);
  const closePrompt = useDraftSubmissionStore(state => state.closePrompt);
  const setNotification = useMapStore(state => state.setNotification);
  const currentDocumentId = useMapStore(state => state.mapDocument?.document_id);
  const setCaptchaToken = useFormState(state => state.setCaptchaToken);

  const draft = useMemo(() => getDraftSubmission(promptDocumentId), [promptDocumentId]);
  const [config, setConfig] = useState<FormConfigPublic | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [emailConfirm, setEmailConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const {TurnstileComponent, captchaToken} = useTurnstile();

  useEffect(() => {
    setConfig(null);
    setValues({});
    setEmailConfirm('');
    setAcknowledged(false);
    setError('');
    if (!draft) return;
    getFormConfig(draft.portalId).then(response => {
      if (response.ok) {
        setConfig(response.response);
        // Self-heal stale/legacy records: the stored mode is a snapshot
        // from draft creation; the config is the server truth.
        if (draft.collectionMode !== response.response.collection_mode) {
          updateDraftSubmission(promptDocumentId!, {
            collectionMode: response.response.collection_mode,
          });
        }
      } else setError('Could not load the portal form. Please try again later.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.portalId, promptDocumentId]);

  // The prompt id must match the map on screen: the store is module-global,
  // so a stale id from a previous map would otherwise finalize (publish) a
  // map the user is no longer looking at.
  if (!promptDocumentId || promptDocumentId !== currentDocumentId || !draft || draft.submitted) {
    return null;
  }
  // The config is server truth: a portal flipped to an auto mode after this
  // draft was created has ALREADY auto-finalized the submission — prompting
  // would ask consent for something published and 409 (burning a captcha).
  if (config && config.collection_mode !== 'prompt') {
    return null;
  }

  const requiredFields = FIELD_ORDER.filter(name => config?.required_fields?.includes(name));
  const needsEmailConfirm = !!config?.require_email_confirm && requiredFields.includes('email');
  const requiredCustoms = (config?.custom_fields ?? []).filter(c => c.required);
  const fieldIsValid = (name: string) => {
    const value = (values[name] ?? '').trim();
    if (!value) return false;
    const spec = FIELD_REGISTRY[name];
    if (name === 'email') return EMAIL_RE.test(value);
    if (spec.pattern && !new RegExp(`^(?:${spec.pattern})$`).test(value)) return false;
    return !spec.validator || spec.validator(value);
  };
  const isValid =
    !!config &&
    acknowledged &&
    !!captchaToken &&
    requiredFields.every(fieldIsValid) &&
    (!needsEmailConfirm || emailConfirm === values['email']) &&
    requiredCustoms.every(c => (values[c.key] ?? '').trim().length > 0);

  const dismiss = () => {
    updateDraftSubmission(promptDocumentId, {suppressed: true});
    closePrompt();
  };

  const submit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const response = await finalizeSubmission(draft.submissionId, {
      fields: values,
      tags: [],
      turnstile_token: captchaToken,
    });
    // Turnstile tokens are single-use: the server verifies the captcha
    // BEFORE any other check, so even a 409/422 consumed it. Clearing the
    // token re-renders the widget; without this every retry fails at
    // Cloudflare with the button still enabled.
    setCaptchaToken('');
    setIsSubmitting(false);
    if (response.ok) {
      updateDraftSubmission(promptDocumentId, {submitted: true});
      closePrompt();
      setNotification({
        message:
          'Your map was submitted to the portal gallery. A frozen copy of the current plan was submitted — you can keep editing your own map.',
        importance: 2,
        type: 'success',
      });
    } else {
      setError(response.error || 'Something went wrong — please try again.');
    }
  };

  return (
    <Dialog.Root open onOpenChange={open => !open && dismiss()}>
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>Submit your map to the portal?</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Your map is marked ready to share. Submit a snapshot of the current plan to the{' '}
          {draft.portalId} gallery — you can keep editing your own map afterwards.
        </Dialog.Description>
        {error && (
          <Blockquote color="red" className="my-2">
            {error}
          </Blockquote>
        )}
        <Flex direction="column" gap="3" mt="3">
          {requiredFields.map(name => {
            const spec = FIELD_REGISTRY[name];
            return (
              <Flex key={name} direction="column" gap="1">
                <FormField
                  name={`portal_${name}`}
                  label={`${spec.label} *`}
                  type={spec.type}
                  component={spec.component}
                  options={spec.options}
                  autoComplete={spec.autoComplete}
                  pattern={spec.pattern}
                  validator={spec.validator}
                  invalidMessage={spec.invalidMessage}
                  required
                  value={values[name] ?? ''}
                  onChangeValue={value => setValues(v => ({...v, [name]: value}))}
                />
                {name === 'email' && needsEmailConfirm && (
                  <FormField
                    name="portal_email_confirm"
                    label="Confirm Email *"
                    type="email"
                    required
                    value={emailConfirm}
                    onChangeValue={setEmailConfirm}
                    validator={value => value === values['email']}
                    invalidMessage="Email addresses must match"
                  />
                )}
              </Flex>
            );
          })}
          {/* Abbreviated by design: like the registry fields above, only
              REQUIRED custom questions are asked here — optional ones are
              full-form-only (SubmissionForm). */}
          {requiredCustoms.map(custom => (
            <Flex key={custom.key} direction="column" gap="1">
              <Text as="label" size="2" weight="medium" htmlFor={custom.key}>
                {custom.label} *
              </Text>
              {custom.field_type === 'textarea' ? (
                <TextArea
                  id={custom.key}
                  value={values[custom.key] ?? ''}
                  placeholder={custom.label}
                  maxLength={5000}
                  onChange={e => setValues(v => ({...v, [custom.key]: e.target.value}))}
                />
              ) : (
                <TextField.Root
                  id={custom.key}
                  value={values[custom.key] ?? ''}
                  placeholder={custom.label}
                  maxLength={255}
                  onChange={e => setValues(v => ({...v, [custom.key]: e.target.value}))}
                />
              )}
            </Flex>
          ))}
          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={checked => setAcknowledged(checked === true)}
              />
              I understand that my submission will be made available to the Commission and other
              members of the public.
            </Flex>
          </Text>
          {TurnstileComponent}
          <Flex gap="3" justify="end">
            <Button variant="soft" color="gray" onClick={dismiss} disabled={isSubmitting}>
              Not now
            </Button>
            <Button onClick={submit} disabled={!isValid} loading={isSubmitting}>
              Submit to portal
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
