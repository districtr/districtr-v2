'use client';
import {useEffect, useState} from 'react';
import {Button, DropdownMenu, Spinner, Text, TextField} from '@radix-ui/themes';
import {ChevronDownIcon, MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {getCounties, CountyListItem} from '@/app/utils/api/apiHandlers/getCounties';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {useCreateMapDocument} from './CreateButton';
import {CreatePlanCountyDialog} from './CreatePlanCountyDialog';

/**
 * "Draw a single county" menu for place pages. County plans are created
 * against the state's "custom" DistrictrMap (group 'custom',
 * num_districts_modifiable) so the number of districts is editable in the
 * editor. Clicking a county creates the plan directly; a top item opens the
 * multi-county dialog. Hidden when the state has no custom map.
 */
export const CountyPlanMenu: React.FC<{maps: Partial<DistrictrMap>[]}> = ({maps}) => {
  const {createPlan, isCreating} = useCreateMapDocument(false);
  const [counties, setCounties] = useState<CountyListItem[] | null>(null);
  const [customMap, setCustomMap] = useState<Partial<DistrictrMap> | null | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const statefps = maps.find(view => view.statefps?.length)?.statefps;

  useEffect(() => {
    if (!statefps?.length) {
      setCustomMap(null);
      return;
    }
    getAvailableDistrictrMaps({group: 'custom'}).then(result => {
      if (!result.ok) return setCustomMap(null);
      setCustomMap(
        result.response.find(m => m.statefps?.some(fp => statefps.includes(fp))) ?? null
      );
    });
  }, [statefps?.join(',')]);

  if (!customMap) return null;

  const loadCounties = () => {
    if (counties || !statefps?.length) return;
    getCounties(statefps)
      .then(setCounties)
      .catch(() => setCounties([]));
  };

  const visibleCounties = (counties ?? []).filter(
    c => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <DropdownMenu.Root onOpenChange={open => open && loadCounties()}>
        <DropdownMenu.Trigger>
          <Button variant="soft" loading={isCreating}>
            Draw a single county
            <ChevronDownIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content style={{maxHeight: 340, overflowY: 'auto'}}>
          <TextField.Root
            size="1"
            mb="1"
            placeholder="Search counties"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
          <DropdownMenu.Item onSelect={() => setDialogOpen(true)}>
            Select multiple counties…
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {counties === null && (
            <DropdownMenu.Item disabled>
              <Spinner size="1" /> Loading counties…
            </DropdownMenu.Item>
          )}
          {counties !== null && !visibleCounties.length && (
            <DropdownMenu.Item disabled>
              <Text size="1">No counties match</Text>
            </DropdownMenu.Item>
          )}
          {visibleCounties.map(county => (
            <DropdownMenu.Item
              key={county.geoid}
              onSelect={() => createPlan(customMap, [county.geoid])}
            >
              {county.name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <CreatePlanCountyDialog
        view={customMap}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        createPlan={countyFilter => createPlan(customMap, countyFilter)}
        isCreating={isCreating}
      />
    </>
  );
};
