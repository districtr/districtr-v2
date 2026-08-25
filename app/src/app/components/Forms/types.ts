import {Select, TextArea, TextField} from '@radix-ui/themes';

export type FormFieldProps = {
  /** Registry field name (fieldRegistry.tsx) — the store key. */
  name: string;
  label: string;
  placeholder?: string;
  type: TextField.RootProps['type'];
  autoComplete?: TextField.RootProps['autoComplete'];
  component?: typeof TextField.Root | typeof TextArea | typeof Select.Root;
  disabled?: boolean;
  required?: boolean;
  options?: Array<{
    label: string;
    value: string;
  }>;
  pattern?: string;
  invalidMessage?: string;
  validator?: (value: string) => boolean;
  /** Override the store read/write (e.g. the email-confirm stub field). */
  value?: string;
  onChangeValue?: (value: string) => void;
};
