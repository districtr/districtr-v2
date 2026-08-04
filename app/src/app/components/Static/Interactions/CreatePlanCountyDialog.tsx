'use client';
import {useEffect, useState} from 'react';
import {Box, Button, Checkbox, Dialog, Flex, Text, TextField} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {getCounties, CountyListItem} from '@/app/utils/api/apiHandlers/getCounties';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

/**
 * Creation-time county picker: start a plan for the whole state, or limit it
 * to selected counties (persisted as the document's county_filter). The filter
 * is set once at creation — there is no editor UI to change it afterward.
 */
export const CreatePlanCountyDialog: React.FC<{
  view: Partial<DistrictrMap>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createPlan: (countyFilter?: string[]) => void;
  isCreating: boolean;
}> = ({view, open, onOpenChange, createPlan, isCreating}) => {
  const [counties, setCounties] = useState<CountyListItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const statefps = view.statefps;

  useEffect(() => {
    if (!open || counties || !statefps?.length) return;
    getCounties(statefps)
      .then(setCounties)
      .catch(() => setCounties([]));
  }, [open, counties, statefps]);

  const selectedSet = new Set(selected);
  const toggleCounty = (geoid: string) =>
    setSelected(
      selectedSet.has(geoid) ? selected.filter(g => g !== geoid) : [...selected, geoid].sort()
    );

  const visibleCounties = (counties ?? []).filter(
    c => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title>Create {view.name}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Draw the whole state, or limit your plan to specific counties.
        </Dialog.Description>
        <Flex direction="column" gap="2" mt="3">
          <TextField.Root
            size="2"
            placeholder="Search counties"
            value={search}
            onChange={e => setSearch(e.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
          <Box className="max-h-64 overflow-y-auto border border-gray-200 rounded p-2">
            <Flex direction="column" gap="1">
              {counties === null ? (
                <Text size="1" color="gray">
                  Loading counties…
                </Text>
              ) : (
                visibleCounties.map(county => (
                  <Text as="label" size="2" key={county.geoid}>
                    <Flex gap="2" align="center">
                      <Checkbox
                        checked={selectedSet.has(county.geoid)}
                        onCheckedChange={() => toggleCounty(county.geoid)}
                      />
                      {county.name}
                    </Flex>
                  </Text>
                ))
              )}
              {counties !== null && !visibleCounties.length && (
                <Text size="1" color="gray">
                  No counties match “{search}”
                </Text>
              )}
            </Flex>
          </Box>
          <Flex gap="2" justify="end" mt="2">
            <Button variant="soft" loading={isCreating} onClick={() => createPlan()}>
              Whole state
            </Button>
            <Button
              disabled={!selected.length}
              loading={isCreating}
              onClick={() => createPlan(selected)}
            >
              {selected.length
                ? `Use ${selected.length} ${selected.length === 1 ? 'county' : 'counties'}`
                : 'Use selected counties'}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
