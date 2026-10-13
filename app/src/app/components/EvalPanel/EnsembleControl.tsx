'use client';
import {Flex, Link, Select, Text} from '@radix-ui/themes';
import {useEnsembleStore} from '@store/ensembleStore';
import type {EnsembleReference} from '@/app/hooks/useEnsembleReference';

/**
 * Which ensemble of computer-drawn plans the panel compares this plan against.
 *
 * A plan with unassigned units, or with a district count the ensemble was never
 * drawn for, has no place in the distributions: the dropdown is disabled and
 * says so, and every other part of the ensemble layer stays off the page. The
 * modal remains reachable, since the methodology is worth reading either way.
 */
export const EnsembleControl: React.FC<{ensemble: EnsembleReference}> = ({ensemble}) => {
  const openModal = useEnsembleStore(state => state.openModal);
  const {index, preset, blocked} = ensemble;
  if (!index || !preset) return null;

  return (
    <Flex align="center" gap="2" wrap="wrap" mt="2">
      <Text size="1">Compared with:</Text>
      <Select.Root
        size="1"
        value={preset.key}
        onValueChange={ensemble.selectPreset}
        disabled={!!blocked}
      >
        <Select.Trigger />
        <Select.Content>
          {index.presets.map(option => (
            <Select.Item key={option.key} value={option.key}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Link
        size="1"
        href="#"
        onClick={event => {
          event.preventDefault();
          openModal(null);
        }}
      >
        About these plans ▸
      </Link>
      {blocked && (
        <Text size="1" color="gray">
          Comparison available once all districts are drawn
        </Text>
      )}
    </Flex>
  );
};
