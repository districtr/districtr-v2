import {useFormState} from '@/app/store/formState';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useEffect} from 'react';

export const AcknowledgementField: React.FC<{id: string; label: string}> = ({id, label}) => {
  const acknowledgement = useFormState(state => state.acknowledgement);
  const setAcknowledgement = useFormState(state => state.setAcknowledgement);

  useEffect(() => {
    setAcknowledgement(id, false);
  }, [id]);

  return (
    <label>
      <Flex direction="row" gap="2" align="center">
        <Checkbox
          checked={acknowledgement[id]}
          onCheckedChange={() => setAcknowledgement(id, !acknowledgement[id])}
          required={true}
        />
        <Text size="2" weight="medium" id={`${id}`}>
          {label}
        </Text>
      </Flex>
    </label>
  );
};
