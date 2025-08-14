'use client';
import {FormState, useFormState} from '@/app/store/formState';
import {Box, Text, TextArea, TextField} from '@radix-ui/themes';
import {useState} from 'react';

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
  const [visited, setVisited] = useState(false);

  const updateFormState = (component: HTMLInputElement) => {
    setFormState(formPart, formProperty as keyof FormState[T], component.value);
  };

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
        onBlur={() => setVisited(true)}
        onFocus={() => setVisited(false)}
        onChange={e => updateFormState(e.target as HTMLInputElement)}
        className={required && visited && !value?.trim().length ? 'border-2 border-red-500' : ''}
      />
    </Box>
  );
}
