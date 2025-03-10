import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Box, IconButton, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';

interface ZoomToFeatureProps {
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void;
  features: GeoJSON.Feature[];
}

export default function ZoomToFeature({
  selectedIndex,
  setSelectedIndex,
  features,
}: ZoomToFeatureProps) {
  const mapRef = useMapStore(state => state.getMapRef());

  // on repeat visit, prevent zooming to bounds on first render
  const [hasMounted, setHasMounted] = useState(false);

  // fires on first layout render
  // after useEffect in component lifecycle
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  const changeSelectedIndex = (amount: number) => {
    const prevIndex = selectedIndex || 0;
    const newIndex = prevIndex + amount;
    if (newIndex < 0 || newIndex >= features.length) return;
    setSelectedIndex(newIndex);
  };

  useEffect(() => {
    if (selectedIndex !== null && hasMounted) {
      const feature = features[selectedIndex];
      feature.properties?.bbox && mapRef?.fitBounds(feature.properties.bbox);
    }
  }, [selectedIndex]);

  return (
    <div>
      {features.length > 1 && (
        <Box>
          <IconButton
            variant="outline"
            onClick={() => changeSelectedIndex(-1)}
            disabled={!selectedIndex || selectedIndex === 0}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Select.Root
            value={`${selectedIndex || 0}`}
            onValueChange={value => setSelectedIndex(parseInt(value))}
          >
            <Select.Trigger mx="2" />
            <Select.Content>
              {features.map((feature, index) => (
                <Select.Item key={index} value={`${index}`}>
                  {index + 1}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <IconButton
            variant="outline"
            onClick={() => changeSelectedIndex(1)}
            disabled={selectedIndex === features.length - 1}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}
    </div>
  );
}
