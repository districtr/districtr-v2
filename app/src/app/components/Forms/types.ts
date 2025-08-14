import {FormState} from '@/app/store/formState';
import {Select, TextArea, TextField} from '@radix-ui/themes';

export type FormPart = 'comment' | 'commenter';

export type FormFieldProps<T extends FormPart> = {
  formPart: T;
  formProperty: keyof FormState[T];
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
  validator?: (value: FormState[T][keyof FormState[T]]) => boolean;
};
