'use client';
import {useEffect, useMemo, useState} from 'react';
import {Blockquote, Box, Button, Checkbox, Dialog, Flex, Text, TextArea} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useDraftSubmissionStore} from '@/app/store/draftSubmissionStore';
import {getDraftSubmission, updateDraftSubmission} from '@/app/utils/draftSubmissions';
import {
  finalizeSubmission,
  getFormConfig,
  type FormConfigPublic,
} from '@/app/utils/api/apiHandlers/postSubmission';
import {FIELD_ORDER, FIELD_REGISTRY} from '@/app/components/Forms/fieldRegistry';
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

  const draft = useMemo(() => getDraftSubmission(promptDocumentId), [promptDocumentId]);
  const [config, setConfig] = useState<FormConfigPublic | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const {TurnstileComponent, captchaToken} = useTurnstile();

  useEffect(() => {
    setConfig(null);
    setValues({});
    setAcknowledged(false);
    setError('');
    if (!draft) return;
    getFormConfig(draft.portalId).then(response => {
      if (response.ok) setConfig(response.response);
      else setError('Could not load the portal form. Please try again later.');
    });
  }, [draft?.portalId, promptDocumentId]);

  if (!promptDocumentId || !draft || draft.submitted) return null;

  const requiredFields = FIELD_ORDER.filter(name => config?.required_fields?.includes(name));
  const isValid =
    !!config &&
    acknowledged &&
    !!captchaToken &&
    requiredFields.every(name => {
      const value = (values[name] ?? '').trim();
      if (!value) return false;
      if (name === 'email') return EMAIL_RE.test(value);
      const spec = FIELD_REGISTRY[name];
      return !spec.validator || spec.validator(value);
    });

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
      setError(response.error);
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
            const isTextArea = spec.component === TextArea;
            return (
              <Flex key={name} direction="column" gap="1">
                <Text as="label" size="2" weight="medium">
                  {spec.label} *
                </Text>
                {isTextArea ? (
                  <TextArea
                    value={values[name] ?? ''}
                    placeholder={spec.label}
                    onChange={e => setValues(v => ({...v, [name]: e.target.value}))}
                  />
                ) : (
                  <input
                    className="rt-TextFieldInput rt-r-size-2 border border-slate-300 rounded p-2"
                    type={spec.type ?? 'text'}
                    value={values[name] ?? ''}
                    placeholder={spec.label}
                    autoComplete={spec.autoComplete}
                    onChange={e => setValues(v => ({...v, [name]: e.target.value}))}
                  />
                )}
              </Flex>
            );
          })}
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
