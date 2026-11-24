'use client';
import {Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';

/**
 * Names, at the top of the map, the group of districts the evaluation panel
 * highlights, so the map says by itself what its highlight shows. Dark, because the
 * highlight's mask turns the map around it nearly white.
 */
export const DistrictHighlightLabel = () => {
  const label = useMapStore(state => state.hoveredPublicZonesLabel);
  if (!label) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-2)] bg-[var(--gray-12)] px-2 py-1 text-white shadow">
      <Text size="2" weight="medium">
        {label}
      </Text>
    </div>
  );
};
