/**
 * The submission field registry: the fixed vocabulary a portal's form config
 * can draw from. LOCKSTEP CONTRACT with backend/app/submissions/fields.py
 * (validation) and cms/datastore/models.py::SUBMISSION_FIELD_CHOICES (the
 * form-config editor): adding a field means touching all three.
 *
 * A portal's FormConfig picks which of these its form shows and which are
 * required (injected into the form block by the CMS content API); this file
 * defines how each renders.
 */
import {Select, TextArea, TextField} from '@radix-ui/themes';
import {VALID_STATES_LABELS} from '@/app/constants/meta/usStates';

export type FieldSection = 'submission' | 'about';

export interface FieldSpec {
  label: string;
  type: TextField.RootProps['type'];
  section: FieldSection;
  autoComplete?: TextField.RootProps['autoComplete'];
  component?: typeof TextField.Root | typeof TextArea | typeof Select.Root;
  options?: Array<{label: string; value: string}>;
  pattern?: string;
  validator?: (value: string) => boolean;
  invalidMessage?: string;
}

export const FIELD_REGISTRY: Record<string, FieldSpec> = {
  title: {
    label: 'Submission Title',
    type: 'text',
    section: 'submission',
    invalidMessage: 'Enter a submission title',
  },
  comment: {
    label: 'Testimony',
    type: 'text',
    section: 'submission',
    component: TextArea,
    invalidMessage: 'Enter your testimony',
  },
  salutation: {
    label: 'Salutation',
    type: 'text',
    section: 'about',
    autoComplete: 'honorific-prefix',
  },
  first_name: {
    label: 'First Name (or identifier)',
    type: 'text',
    section: 'about',
    autoComplete: 'given-name',
    invalidMessage: 'Enter your first name or identifier',
  },
  last_name: {
    label: 'Last Name',
    type: 'text',
    section: 'about',
    autoComplete: 'family-name',
  },
  email: {
    label: 'Email',
    type: 'email',
    section: 'about',
    autoComplete: 'email',
    invalidMessage: 'Enter a valid email address',
  },
  place: {
    label: 'City/County',
    type: 'text',
    section: 'about',
    autoComplete: 'address-level2',
    invalidMessage: 'Enter a city or county',
  },
  state: {
    label: 'State',
    type: 'text',
    section: 'about',
    autoComplete: 'address-level1',
    component: Select.Root,
    options: VALID_STATES_LABELS,
    invalidMessage: 'Select a state',
  },
  zip_code: {
    label: 'Zip Code',
    type: 'text',
    section: 'about',
    autoComplete: 'postal-code',
    pattern: '[0-9]{5}',
    validator: value => /[0-9]{5}/.test(value ?? ''),
    invalidMessage: 'Please enter a valid 5-digit zip code',
  },
};

/** Render order within each section. */
export const FIELD_ORDER = [
  'title',
  'comment',
  'salutation',
  'first_name',
  'last_name',
  'email',
  'place',
  'state',
  'zip_code',
];

/** Fields the public list never serves — mirrored from the backend. */
export const PRIVATE_FIELDS = new Set(['email']);
