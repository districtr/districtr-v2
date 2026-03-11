import {useMapStore} from '@/app/store/mapStore';
import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {Button, Dialog, Flex, Heading, Text} from '@radix-ui/themes';
import {useEffect, useState} from 'react';
import {MapDetailsSection} from './MapDetailsSection';
import {ShareMapSection} from './ShareMapSection';
import {useSaveShareStore} from '@/app/store/saveShareStore';
import {Link1Icon} from '@radix-ui/react-icons';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import {useRouter} from 'next/navigation';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';

export const SaveShareModal: React.FC<{
  open: boolean;
  onClose: () => void;
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({open, onClose, handleMetadataChange}) => {
  const router = useRouter();
  const mapMetadata = useMapMetadata();
  const mapDocument = useMapStore(state => state.mapDocument);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const [innerFormState, setInnerFormState] = useState<DocumentMetadata>(
    mapMetadata ?? DEFAULT_MAP_METADATA
  );
  const [linkCopied, setLinkCopied] = useState(false);
  const setMapLock = useMapStore(state => state.setMapLock);
  const isEditing = useMapStore(state => state.mapDocument?.access === 'edit');
  const generateLink = useSaveShareStore(state => state.generateLink);

  const handleCopy = async () => {
    if (!mapDocument?.public_id) return;
    setMapLock({
      isLocked: true,
      reason: 'Creating map copy',
    });
    const response = await createMapDocument({
      copy_from_doc: mapDocument?.public_id,
      districtr_map_slug: mapDocument?.districtr_map_slug,
      metadata: {
        ...mapDocument?.map_metadata,
        name: mapMetadata?.name ? `${mapMetadata.name} (Copy)` : '',
      },
    });
    if (response.ok) {
      router.push(`/map/edit/${response.response.document_id}`);
      onClose();
    } else {
      setErrorNotification({
        message: response.error.detail,
        severity: 2,
      });
    }
    setMapLock(null);
  };

  const handleSave = async () => {
    setMapLock({
      isLocked: true,
      reason: 'Saving map assignments',
    });
    handleMetadataChange(innerFormState).then(() => {
      setMapLock(null);
      onClose();
    });
  };

  const handleInnerFormStateChange = (updates: Partial<DocumentMetadata>) => {
    setInnerFormState(prev => ({...prev, ...updates}));
  };

  useEffect(() => handleInnerFormStateChange(mapMetadata ?? DEFAULT_MAP_METADATA), [mapMetadata]);

  useEffect(() => {
    if (linkCopied) {
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [linkCopied]);

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Content>
        <Dialog.Title>Map Details</Dialog.Title>
        {/* Hidden description for screen readers */}
        <Dialog.Description className="invisible h-0 overflow-hidden">
          A dialog menu to update the map name, status (scratch work, in progress, or ready to
          share), advanced map details, and share link.
        </Dialog.Description>
        <Flex direction="column" gap="2">
          <MapDetailsSection
            mapMetadata={innerFormState}
            onChange={handleInnerFormStateChange}
            isEditing={isEditing}
          />
          <hr className="my-4" />
          <ShareMapSection isEditing={isEditing} />
          {isEditing ? (
            <Flex direction="row" gap="2" justify="between" className="mt-4">
              <Button
                variant="soft"
                onClick={() => generateLink().then(() => setLinkCopied(true))}
                size="3"
              >
                <Flex direction="row" gap="2" align="center" className="flex-0 w-fit">
                  <Link1Icon />
                  <Text>{linkCopied ? 'Copied!' : 'Copy Share Link'}</Text>
                </Flex>
              </Button>
              <Button variant="soft" onClick={handleSave} size="3" color="green">
                Done
              </Button>
            </Flex>
          ) : (
            <Flex direction="column" gap="2">
              <Heading as="h3" size="5">
                View only map
              </Heading>
              <Text>
                You can view this map, but you cannot edit it. Make a copy to duplicate the plan
                under a new PlanID.
              </Text>
              <Button variant="soft" onClick={handleCopy} size="3">
                Create Copy
              </Button>
            </Flex>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
