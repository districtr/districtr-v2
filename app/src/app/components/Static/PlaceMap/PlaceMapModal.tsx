'use client';
import {Dialog, Link} from '@radix-ui/themes';
import {ResponsivePlaceMap} from './PlaceMap';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';

export const PlaceMapModal: React.FC<{children?: React.ReactNode}> = ({children}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setModalOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
      <Dialog.Trigger className="cursor-pointer">
        {children ? (
          children
        ) : (
          <Link className="text-sm !tracking-wider !font-bold" href="#">
            Start Mapping
          </Link>
        )}
      </Dialog.Trigger>
      <Dialog.Content maxWidth="80vw" className="overflow-hidden">
        {modalOpen && <ResponsivePlaceMap />}
      </Dialog.Content>
    </Dialog.Root>
  );
};
