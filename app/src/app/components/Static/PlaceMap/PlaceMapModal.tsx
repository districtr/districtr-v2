'use client';
import {Dialog, Link} from '@radix-ui/themes';
import {ResponsivePlaceMap} from './PlaceMap';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';

export const PlaceMapModal: React.FC<{
  children?: React.ReactNode;
  _open?: boolean;
  _setOpen?: (open: boolean) => void;
  noTrigger?: boolean;
}> = ({children, _open, _setOpen, noTrigger}) => {
  const [modalOpen, setModalOpen] = useState(_open);
  const isOpen = _open || modalOpen;
  const handleOpenChange = _setOpen || setModalOpen;
  const pathname = usePathname();

  useEffect(() => {
    handleOpenChange(false);
  }, [pathname]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      {!noTrigger && (
        <Dialog.Trigger>
          {children ? (
            children
          ) : (
            <Link className="text-sm !tracking-wider !font-bold cursor-pointer" href="#">
              Start Mapping
            </Link>
          )}
        </Dialog.Trigger>
      )}
      <Dialog.Content maxWidth="80vw" className="overflow-hidden">
        <Dialog.Title className="sr-only">Map of available state</Dialog.Title>
        {isOpen && <ResponsivePlaceMap />}
      </Dialog.Content>
    </Dialog.Root>
  );
};
