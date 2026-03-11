import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Dialog, Flex} from '@radix-ui/themes';
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
      <Dialog.Content className="max-w-[50vw]">
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
        <Uploader redirect={true} onFinish={onClose} />
      </Dialog.Content>
    </Dialog.Root>
  );
};
