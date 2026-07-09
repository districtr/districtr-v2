import React, {useMemo, useState} from 'react';
import {Flex, IconButton, Text, TextField} from '@radix-ui/themes';
import {ArrowDownIcon, ArrowUpIcon, Cross2Icon, MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {PlacesCMSContent} from '@/app/utils/api/cms';

/**
 * Autocomplete + ordered list for a place page's map components. Search filters
 * the in-memory map list from cmsFormStore; the selected maps render in their
 * saved order with up/down reordering (the order is what the place page shows).
 */
export const MapMultiSelector: React.FC = () => {
  const maps = useCmsFormStore(state => state.maps);
  const formData = useCmsFormStore(state => state.formData);
  const handleChange = useCmsFormStore(state => state.handleChange);
  const selectedSlugs =
    (formData?.content as unknown as PlacesCMSContent)?.districtr_map_slugs ?? [];

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return maps
      .filter(
        m =>
          !selectedSlugs.includes(m.districtr_map_slug) &&
          (m.name.toLowerCase().includes(q) || m.districtr_map_slug.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [maps, query, selectedSlugs]);

  const nameFor = (slug: string) => maps.find(m => m.districtr_map_slug === slug)?.name ?? slug;

  const addMap = (slug: string) => {
    // The `multiple` branch appends, preserving insertion order.
    handleChange('districtr_map_slugs', true)(slug);
    setQuery('');
    setActiveIndex(-1);
  };

  const removeMap = (slug: string) => handleChange('districtr_map_slugs', true)(slug);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selectedSlugs.length) return;
    const next = [...selectedSlugs];
    [next[index], next[target]] = [next[target], next[index]];
    // The non-multiple branch sets the property wholesale.
    handleChange('districtr_map_slugs')(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(i => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      addMap(suggestions[Math.max(activeIndex, 0)].districtr_map_slug);
    } else if (event.key === 'Escape') {
      setQuery('');
      setActiveIndex(-1);
    }
  };

  return (
    <Flex direction="column" gapY="2">
      <Text as="label" htmlFor="districtr_map_slugs">
        Maps (optional, displayed in this order)
      </Text>
      <Flex direction="column" position="relative">
        <TextField.Root
          id="districtr_map_slugs"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search maps by name…"
          role="combobox"
          aria-expanded={suggestions.length > 0}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
          >
            {suggestions.map((map, i) => (
              <li
                key={map.districtr_map_slug}
                role="option"
                aria-selected={i === activeIndex}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                // onMouseDown so the click wins over the input losing focus
                onMouseDown={e => {
                  e.preventDefault();
                  addMap(map.districtr_map_slug);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {map.name}
              </li>
            ))}
          </ul>
        )}
      </Flex>
      {selectedSlugs.map((slug, i) => (
        <Flex key={slug} direction="row" align="center" gapX="2">
          <Text size="1" color="gray" className="w-4 text-right">
            {i + 1}.
          </Text>
          <Text size="2" className="flex-grow truncate">
            {nameFor(slug)}
          </Text>
          <IconButton
            variant="ghost"
            size="1"
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label={`Move ${nameFor(slug)} up`}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            variant="ghost"
            size="1"
            disabled={i === selectedSlugs.length - 1}
            onClick={() => move(i, 1)}
            aria-label={`Move ${nameFor(slug)} down`}
          >
            <ArrowDownIcon />
          </IconButton>
          <IconButton
            variant="ghost"
            size="1"
            color="red"
            onClick={() => removeMap(slug)}
            aria-label={`Remove ${nameFor(slug)}`}
          >
            <Cross2Icon />
          </IconButton>
        </Flex>
      ))}
    </Flex>
  );
};
