'use client';
import {FormState, useFormState} from '@/app/store/formState';
import {Box, Flex, Select, Text, TextField} from '@radix-ui/themes';
import {useState} from 'react';
import {FormFieldProps, FormPart} from './types';

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
  options,
  validator
}: FormFieldProps<T>) {
  const value = useFormState(state => state[formPart][formProperty] as string);
  const setFormState = useFormState(state => state.setFormState);
  const Component = component ?? TextField.Root;
  const [invalid, setInvalid] = useState(false);

  const validate = (_value: string) => {
    const v = _value ?? value;
    return v?.trim().length && (!validator || validator(v as FormState[T][keyof FormState[T]]))
  }
  const updateFormState = (component: HTMLInputElement | string) => {
    const value = typeof component === 'string' ? component : component.value;  
    setInvalid(!validate(value));
    setFormState(formPart, formProperty as keyof FormState[T], value);
  };

  return (
    <Flex direction="column" gap="1">
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
        onBlur={() => (required && !validate(value)) && setInvalid(true)}
        onFocus={() => setInvalid(false)}
        onChange={e => component !== Select.Root && updateFormState(e.target as HTMLInputElement)}
        onValueChange={e => component === Select.Root && updateFormState(e as any)}
        className={invalid ? 'border-2 border-red-500' : ''}
      >
        {component === Select.Root && (
          <Select.Trigger placeholder={placeholder ?? label} />
        )}
        {options && (
          <Select.Content>
            {options.map(option => (
              <Select.Item key={option.value} value={option.value}>{option.label}</Select.Item>
            ))}
          </Select.Content>
        )}
      </Component>
    </Flex>
  );
}
