import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Dialog, Flex, Text} from '@radix-ui/themes';
import {Uploader} from '../Uploader/Uploader';

export const UploaderModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
}> = ({open, onClose}) => {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose?.();
    }
  };

  useEffect(() => {
    if (!open) {
      // Ensure body pointer-events is restored when dialog closes
      document.body.style.pointerEvents = '';
    }
    // Cleanup on unmount
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content className="w-[95vw] max-w-[760px]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">
            Upload Block Assignments
          </Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Text size="2" color="gray" className="mb-4 block">
          Upload a CSV that includes a GEOID column and a district/zone column. We&apos;ll try to
          detect them automatically and ask for help if the columns are ambiguous.
        </Text>
        <Uploader redirect={true} onFinish={onClose} />
      </Dialog.Content>
    </Dialog.Root>
  );
};
