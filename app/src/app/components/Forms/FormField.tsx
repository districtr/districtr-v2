'use client';
import {useFormState} from '@/app/store/formState';
import {Flex, Select, Text, TextField, Tooltip} from '@radix-ui/themes';
import {useEffect, useState} from 'react';
import {FormFieldProps} from './types';

export function FormField({
  name,
  label,
  type,
  placeholder,
  component,
  disabled,
  required,
  autoComplete,
  options,
  validator,
  pattern,
  invalidMessage,
  value: valueOverride,
  onChangeValue,
}: FormFieldProps) {
  const storeValue = useFormState(state => state.fields[name] ?? '');
  const setField = useFormState(state => state.setField);
  const value = valueOverride ?? storeValue;
  const Component = component ?? TextField.Root;
  const highlightErrors = useFormState(state => state.highlightErrors);

  const [invalid, setInvalid] = useState(false);

  const validate = (_value: string) => {
    const v = _value ?? value;
    return v?.trim().length && (!validator || validator(v));
  };

  const updateFormState = (component: HTMLInputElement | string) => {
    const next = typeof component === 'string' ? component : component.value;
    setInvalid(!validate(next));
    (onChangeValue ?? (v => setField(name, v)))(next);
  };

  useEffect(() => {
    if (highlightErrors && required) {
      !validate(value) && setInvalid(true);
    }
  }, [highlightErrors]);

  const props = {
    required,
    placeholder: placeholder ?? label,
    type,
    name,
    'aria-label': name,
    value: disabled ? '' : (value ?? ''),
    autoComplete: disabled ? 'off' : autoComplete,
    onBlur: () => required && !validate(value) && setInvalid(true),
    onFocus: () => setInvalid(false),
    className: invalid ? 'border-2 border-red-500' : '',
    'data-invalid': invalid,
    'aria-invalid': invalid,
    pattern,
  };
  return (
    <Tooltip
      content={invalidMessage ?? `${required ? 'Required: ' : ''}${invalid ? 'Invalid Entry' : ''}`}
      open={required && invalid && highlightErrors}
      alignOffset={0}
    >
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="medium" id={name}>
          {label}
        </Text>
        {component !== Select.Root ? (
          <Component {...props} onChange={e => updateFormState(e.target as HTMLInputElement)} />
        ) : (
          <Component
            {...props}
            onValueChange={e => {
              e && updateFormState(e as any);
            }}
          >
            <Select.Trigger
              placeholder={placeholder ?? label}
              className={props.className}
              style={{
                border: invalid ? '2px solid red' : undefined,
              }}
            />
            <Select.Content>
              {(options ?? []).map(option => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Component>
        )}
      </Flex>
    </Tooltip>
  );
}
