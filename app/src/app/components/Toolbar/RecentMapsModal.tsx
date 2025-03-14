import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import * as Accordion from '@radix-ui/react-accordion';
import classNames from 'classnames';
import {DoubleArrowDownIcon, DragHandleHorizontalIcon} from '@radix-ui/react-icons';
import {
  Button,
  Flex,
  Text,
  Table,
  Dialog,
  Box,
  TextField,
  IconButton,
  RadioCards,
  Separator,
} from '@radix-ui/themes';
import {SaveMapDetails} from './SaveMapsModal';
import {usePathname, useSearchParams, useRouter} from 'next/navigation';
import {DocumentObject, DocumentMetadata} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {useTemporalStore} from '@/app/store/temporalStore';
import {size} from 'lodash';
type NamedDocumentObject = DocumentObject & {name?: string};

const DialogContentContainer = styled(Dialog.Content, {
  maxWidth: '75vw',
  maxHeight: 'calc(100vh-2rem)',
});

export const RecentMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore(store => store.mapDocument);
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const setActiveTool = useMapStore(store => store.setActiveTool);
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [openItem, setOpenItem] = React.useState<string | null>(null);

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  const clear = useTemporalStore(store => store.clear);

  const handleMapDocument = (data: DocumentObject) => {
    setMapDocument(data);
    clear();
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set('document_id', data.document_id);
    router.push(pathname + '?' + urlParams.toString());

    // open the correct accordion item
    setOpenItem(data.document_id);

    // close dialog
    setDialogOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!dialogOpen) {
      setActiveTool('pan');
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  if (!userMaps?.length) {
    return null;
  }

  return (
    <Dialog.Root
      width="75vw"
      open={dialogOpen}
      onOpenChange={isOpen =>
        isOpen ? setDialogOpen(isOpen) : onClose ? onClose() : setDialogOpen(isOpen)
      }
    >
      {!!showTrigger && (
        <Dialog.Trigger>
          <Button variant="ghost" disabled={!userMaps.length}>
            Saved Maps
          </Button>
        </Dialog.Trigger>
      )}
      <DialogContentContainer className="max-w-[50vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Saved Maps</Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box className="max-h-[50vh] overflow-y-auto">
          <Flex
            align="center"
            display="grid"
            justify="center"
            className="grid grid-cols-3 py-2 border-b font-bold bg-gray-100 w-full"
            gapX="22%"
            width="100%"
            position="absolute"
          >
            <Text>Name</Text>
            <Text>Last Updated</Text>
            <Text>Actions</Text>
            <Text></Text>
          </Flex>
          <Accordion.Root
            type="single"
            size="3"
            value={openItem}
            onValueChange={value => setOpenItem(value || null)}
          >
            {userMaps.map((userMap, i) => (
              <Accordion.Item
                key={i}
                value={userMap.document_id}
                pl=".5rem"
                className={`${openItem === userMap.document_id ? 'bg-yellow-100' : ''}`}
              >
                <RecentMapsRow
                  key={i}
                  active={mapDocument?.document_id === userMap.document_id}
                  onChange={userMapData =>
                    upsertUserMap({
                      userMapData,
                      userMapDocumentId: userMap.document_id,
                    })
                  }
                  data={userMap}
                  onSelect={handleMapDocument}
                  isOpen={openItem === userMap.document_id}
                  toggleOpen={() =>
                    setOpenItem(prev => (prev === userMap.document_id ? null : userMap.document_id))
                  }
                />
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Box>
      </DialogContentContainer>
    </Dialog.Root>
  );
};

const RecentMapsRow: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
  active: boolean;
  onChange?: (data?: DocumentObject) => void;
  isOpen: boolean;
  toggleOpen: () => void;
}> = ({data, onSelect, active, onChange, isOpen, toggleOpen}) => {
  const updatedDate = new Date(data.updated_at as string);
  const formattedDate = updatedDate.toLocaleDateString();
  const metadataName = data?.map_metadata?.name || data.gerrydb_table;
  const [mapName, setMapName] = React.useState(metadataName);
  const [nameIsChanged, setNameIsChanged] = React.useState(false);
  const [nameIsSaved, setNameIsSaved] = React.useState(true);

  const handleChangeName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== metadataName && name !== null) {
      setNameIsSaved(false);
      setMapName(name);
    }
  };

  const handleChangeNameMetadata = (value: string | null) => {
    if (value !== metadataName) {
      handleChangeName(value);
    }
    onChange?.({...data, map_metadata: {...data.map_metadata, name: value}});
  };

  return (
    <div className="flex flex-col">
      <Accordion.Header className="w-full">
        <div className="grid grid-cols-4 gap-4 w-full items-center px-4 py-2">
          <div>
            {!!(active && onChange) ? (
              <Flex align="center" gap="2">
                <TextField.Root
                  size="2"
                  maxWidth="100%"
                  value={mapName}
                  onChange={e => {
                    handleChangeNameMetadata(e.target.value);
                  }}
                />
              </Flex>
            ) : (
              <Text>{mapName}</Text>
            )}
          </div>

          {/* Last Updated Date */}
          <div className="flex justify-center">
            <Text>{formattedDate}</Text>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center">
            {active ? (
              <Button variant="outline" onClick={toggleOpen}>
                {isOpen ? 'Close Details' : 'Edit Details'}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onSelect(data)}>
                Load
              </Button>
            )}
          </div>

          {/* Delete Icon */}
          {!active && (
            <IconButton variant="ghost" color="ruby" onClick={() => onChange?.()}>
              <Cross2Icon />
            </IconButton>
          )}
        </div>
      </Accordion.Header>

      {/* Accordion Content */}
      <Accordion.Content className="px-4 py-2">
        <Flex gap="4">
          <Separator size="4" className="p-1" />
        </Flex>
        <SaveMapDetails nameIsSaved={nameIsSaved} setNameIsSaved={setNameIsSaved} />
      </Accordion.Content>
    </div>
  );
};

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Trigger>
>(({children, className, ...props}, forwardedRef) => (
  <Accordion.Header className="flex">
    <Accordion.Trigger
      className={classNames(
        `bg-white group flex h-[45px] flex-1 cursor-default items-center justify-between px-5 leading-none rounded-md data-[state=closed]:shadow-md outline-none hover:bg-blue-200`,
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
    </Accordion.Trigger>
  </Accordion.Header>
));

AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Content>
>(({children, className, ...props}, forwardedRef) => (
  <Accordion.Content
    className={classNames(
      'overflow-hidden text-[15px] data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown',
      className
    )}
    {...props}
    ref={forwardedRef}
  >
    <div className="px-5 py-[15px]">{children}</div>
  </Accordion.Content>
));
AccordionContent.displayName = 'AccordionContent';
