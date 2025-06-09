import {Button, Text, Spinner, Tooltip} from '@radix-ui/themes';
import {ReloadIcon} from '@radix-ui/react-icons';
// @ts-ignore – missing types
import RelativeTime from 'react-relative-time';

// Separate timestamp formatting component
export const TimestampDisplay = ({timestamp}: {timestamp: string | null}) => {
  if (!timestamp) {
    return <Spinner />;
  }

  return (
    <Tooltip content={timestamp}>
      <Text size="2" color="gray" className="hover:underline hover:decoration-gray-400">
        Updated <RelativeTime value={timestamp} />
      </Text>
    </Tooltip>
  );
};

export const RefreshButton = ({onClick}: {onClick: () => void}) => {
  return (
    <Button onClick={onClick} variant="outline">
      <ReloadIcon /> Refresh
    </Button>
  );
};
