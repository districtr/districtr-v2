'use client';
import React, {useState, useCallback, useRef, useEffect} from 'react';
import type {LngLatBoundsLike, MapRef} from 'react-map-gl/maplibre';
import {MAPTILER_API_KEY} from '@/app/utils/api/constants';
import {useMapStore} from '@/app/store/mapStore';
import {TextField} from '@radix-ui/themes';

const GEOCODE_URL = 'https://api.maptiler.com/geocoding';
const DEBOUNCE_MS = 300;

interface GeocodeFeature {
  geometry: {coordinates: [number, number]};
  place_name?: string;
  text?: string;
}

interface GeocodeResponse {
  features?: GeocodeFeature[];
}

export const GeocodeSearchBar: React.FC<{
  mapRef: React.RefObject<MapRef | null>;
  mapBounds?: LngLatBoundsLike;
  className?: string;
}> = ({mapRef, mapBounds, className}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = 'geocode-search-listbox';

  // Reset the active keyboard cursor whenever the results list changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions.length]);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (!MAPTILER_API_KEY || !q.trim()) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const trimmedQuery = q.trim();
        const url = new URL(`${GEOCODE_URL}/${encodeURIComponent(trimmedQuery)}.json`);
        const mapCenter = mapRef.current?.getMap?.()?.getCenter();

        url.searchParams.set('key', MAPTILER_API_KEY);
        url.searchParams.set('limit', '5');
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('fuzzyMatch', 'true');
        url.searchParams.set('country', 'us');
        url.searchParams.set(
          'types',
          [
            'county',
            'joint_municipality',
            'joint_submunicipality',
            'municipality',
            'municipal_district',
            'locality',
            'neighbourhood',
            'place',
            'postal_code',
            'address',
            'road',
            'poi',
          ].join(',')
        );
        if (mapCenter) {
          url.searchParams.set('proximity', `${mapCenter.lng},${mapCenter.lat}`);
        }
        if (mapBounds) {
          const bbox = Array.isArray(mapBounds) ? mapBounds : mapBounds.toArray();
          url.searchParams.set('bbox', bbox.flat().join(','));
        }

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Geocode search failed with status ${res.status}`);
        }

        const data: GeocodeResponse = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
        setErrorNotification({
          message: 'Failed to search for places.',
          severity: 2,
        });
      } finally {
        setLoading(false);
      }
    },
    [mapRef, mapBounds, setErrorNotification]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const flyTo = useCallback(
    (lng: number, lat: number) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;
      map.flyTo({center: [lng, lat], zoom: Math.max(map.getZoom(), 14)});
      setOpen(false);
      setQuery('');
      setSuggestions([]);
    },
    [mapRef]
  );

  if (!MAPTILER_API_KEY) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const target = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
      if (target) {
        e.preventDefault();
        const [lng, lat] = target.geometry.coordinates;
        flyTo(lng, lat);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative z-10 ${className ?? ''}`}>
      <TextField.Root
        placeholder="Search for a place…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        size="2"
        className="min-w-[200px] bg-white/95 shadow border border-black/10"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open && (suggestions.length > 0 || loading)}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
      />
      {open && (suggestions.length > 0 || loading) && (
        <ul
          id={listboxId}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-black/10 shadow-lg rounded overflow-hidden z-20 max-h-48 overflow-y-auto"
          role="listbox"
        >
          {loading && <li className="px-3 py-2 text-gray-500 text-sm">Searching…</li>}
          {!loading &&
            suggestions.map((f, i) => {
              const isActive = i === activeIndex;
              return (
                <li
                  key={i}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={isActive}
                  className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-0 ${
                    isActive ? 'bg-blue-100' : 'hover:bg-gray-100'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => {
                    const [lng, lat] = f.geometry.coordinates;
                    flyTo(lng, lat);
                  }}
                >
                  {f.place_name ?? f.text ?? 'Unknown'}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
};
