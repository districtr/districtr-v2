import {useFormState} from '@/app/store/formState';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useEffect} from 'react';

export const AcknowledgementField: React.FC<{id: string; label: string}> = ({id, label}) => {
  const highlightErrors = useFormState(state => state.highlightErrors);
  const acknowledgement = useFormState(state => state.acknowledgement);
  const setAcknowledgement = useFormState(state => state.setAcknowledgement);

  useEffect(() => {
    setAcknowledgement(id, false);
  }, [id]);

  return (
    <label>
      <Flex direction="row" gap="2" align="center">
        <Checkbox
          checked={acknowledgement[id] ?? false}
          onCheckedChange={() => setAcknowledgement(id, !acknowledgement[id])}
          required={true}
          style={{
            backgroundColor: highlightErrors && !acknowledgement[id] ? 'red' : undefined,
            borderRadius: '4px',
          }}
        />
        <Text size="2" weight="medium" id={`${id}`}>
          {label}
        </Text>
      </Flex>
    </label>
  );
};
