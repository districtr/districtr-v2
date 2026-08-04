'use client';
import {useState} from 'react';
import {Button, DropdownMenu, Spinner, Text, TextField} from '@radix-ui/themes';
import {ChevronDownIcon, MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {getCounties, CountyListItem} from '@/app/utils/api/apiHandlers/getCounties';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {canFilterByCounty, useCreateMapDocument} from './CreateButton';

/**
 * "Draw a single county" menu for place pages: lists the state's counties and
 * creates a county-filtered plan. With one district-plan view, clicking a
 * county creates directly; with several, a submenu picks the view.
 */
export const CountyPlanMenu: React.FC<{maps: Partial<DistrictrMap>[]}> = ({maps}) => {
  const {createPlan, isCreating} = useCreateMapDocument(false);
  const [counties, setCounties] = useState<CountyListItem[] | null>(null);
  const [search, setSearch] = useState('');
  const views = maps.filter(view => canFilterByCounty(view, false));
  const statefps = views[0]?.statefps;

  if (!views.length) return null;

  const loadCounties = () => {
    if (counties || !statefps?.length) return;
    getCounties(statefps)
      .then(setCounties)
      .catch(() => setCounties([]));
  };

  const create = (view: Partial<DistrictrMap>, county: CountyListItem) =>
    createPlan(view, [county.geoid]);

  const visibleCounties = (counties ?? []).filter(
    c => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
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
        {visibleCounties.map(county =>
          views.length === 1 ? (
            <DropdownMenu.Item key={county.geoid} onSelect={() => create(views[0], county)}>
              {county.name}
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Sub key={county.geoid}>
              <DropdownMenu.SubTrigger>{county.name}</DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                {views.map(view => (
                  <DropdownMenu.Item
                    key={view.districtr_map_slug}
                    onSelect={() => create(view, county)}
                  >
                    {view.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          )
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
