'use client';

import {Dialog} from '@radix-ui/themes';
import {CrossCircledIcon} from '@radix-ui/react-icons';

export const EmbeddedPdfModal: React.FC<{
  url: string;
  children: React.ReactNode;
}> = ({url, children}) => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>{children}</Dialog.Trigger>
      <Dialog.Content className="!w-[80vw] !h-[80vh] max-w-none max-h-none relative">
        <iframe src={url} className="size-full" />
        {/* <Dialog.Close className="absolute top-0 right-0" />
        <CrossCircledIcon className="absolute top-0 right-0" /> */}
      </Dialog.Content>
    </Dialog.Root>
  );
};
