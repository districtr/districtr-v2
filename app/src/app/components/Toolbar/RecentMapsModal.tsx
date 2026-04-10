import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Dialog} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/types';
import {useUserMaps} from '@/app/hooks/useUserMaps';
import {RecentMapsList} from '@/app/components/RecentMapsList';

export const RecentMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const setActiveTool = useMapControlsStore(store => store.setActiveTool);
  const {communityMaps, districtMaps} = useUserMaps();

  useEffect(() => {
    if (!open) {
      setActiveTool(ACTIVE_TOOLS.PAN);
      document.body.style.pointerEvents = '';
    }
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, [open, setActiveTool]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose?.();
    }
  };

  const hasAnyMaps = communityMaps.length > 0 || districtMaps.length > 0;
  if (!hasAnyMaps) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {!!showTrigger && (
        <Dialog.Trigger>
          <Button variant="ghost" disabled={!hasAnyMaps}>
            Recent Maps
          </Button>
        </Dialog.Trigger>
      )}
      <Dialog.Content
        className="sm:w-[95vw] md:w-[60vw] max-h-[calc(100vh-2rem)]"
        id="recent-maps-modal"
      >
        <Flex align="center" className="mb-3">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Recent Maps</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <RecentMapsList maxHeight="55vh" onNavigate={onClose} />
      </Dialog.Content>
    </Dialog.Root>
  );
};
