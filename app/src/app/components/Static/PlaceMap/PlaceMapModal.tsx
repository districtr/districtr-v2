'use client';
import {Dialog, Link} from '@radix-ui/themes';
import {ResponsivePlaceMap} from './PlaceMap';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';

export const PlaceMapModal: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setModalOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
      <Dialog.Trigger>
        <Link className="text-sm !tracking-wider" href="#">
          OPEN THE MAP
        </Link>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="80vw" className="overflow-hidden">
        {modalOpen && <ResponsivePlaceMap />}
      </Dialog.Content>
    </Dialog.Root>
  );
};
