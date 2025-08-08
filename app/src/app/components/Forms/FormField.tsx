'use client';
import {FormState, useFormState} from '@/app/store/formState';
import {Box, Text, TextArea, TextField} from '@radix-ui/themes';

type FormPart = 'comment' | 'commenter';

type FormFieldProps<T extends FormPart> = {
  formPart: T;
  formProperty: keyof FormState[T];
  label: string;
  placeholder?: string;
  type: TextField.RootProps['type'];
  autoComplete?: TextField.RootProps['autoComplete'];
  component?: typeof TextField.Root | typeof TextArea;
  disabled?: boolean;
  required?: boolean;
};

export function FormField<T extends FormPart>({
  formPart,
  formProperty,
  label,
  type,
  placeholder,
  component,
  disabled,
  required,
  autoComplete,
}: FormFieldProps<T>) {
  const value = useFormState(state => state[formPart][formProperty] as string);
  const setFormState = useFormState(state => state.setFormState);
  const Component = component ?? TextField.Root;
  return (
    <Box>
      <Text as="label" size="2" weight="medium" id={`${formPart}-${formProperty as string}`}>
        {label}
      </Text>
      <Component
        required={required}
        placeholder={placeholder ?? label}
        type={type}
        name={`${formPart}-${formProperty as string}`}
        aria-labelledby={`${formPart}-${formProperty as string}`}
        value={disabled ? '' : (value ?? '')}
        autoComplete={disabled ? 'off' : autoComplete}
        disabled={disabled}
        onChange={e => setFormState(formPart, formProperty as keyof FormState[T], e.target.value)}
      />
    </Box>
  );
}
