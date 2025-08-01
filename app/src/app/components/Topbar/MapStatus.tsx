'use client';
import {Text, Flex, IconButton, Box, Tooltip, Popover, SegmentedControl} from '@radix-ui/themes';
import {useState} from 'react';
import {DocumentMetadata, DocumentObject, DraftStatus} from '@/app/utils/api/apiHandlers/types';
import {InProgressIcon, ScratchWorkIcon, ReadyIcon} from './Icons';

const statusIcons: Record<DraftStatus, React.FC> = {
  scratch: ScratchWorkIcon,
  in_progress: InProgressIcon,
  ready_to_share: ReadyIcon,
};

const statusText: Record<DraftStatus, string> = {
  scratch: 'Scratch Work',
  in_progress: 'In Progress',
  ready_to_share: 'Ready to Share',
};

const iconOrder: DraftStatus[] = ['scratch', 'in_progress', 'ready_to_share'];

export const MapStatus: React.FC<{
  mapDocument: DocumentObject | null;
  mapMetadata: DocumentMetadata | null;
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({mapDocument, mapMetadata, handleMetadataChange}) => {
  const draftStatus = mapMetadata?.draft_status ?? 'scratch';
  const Icon = statusIcons[draftStatus] ?? ScratchWorkIcon;
  const StatusText = statusText[draftStatus] ?? 'Scratch Work';
  const editing = mapDocument?.access === 'edit' && mapDocument?.status === 'checked_out';
  const [modalOpen, setModalOpen] = useState(false);

  const handleChangeStatus = async (status: DraftStatus) => {
    handleMetadataChange({
      draft_status: status,
    }).then(() => {
      setModalOpen(false);
    });
  };
  if (!mapDocument) return null;

  return (
    <Popover.Root open={modalOpen} onOpenChange={setModalOpen}>
      <Popover.Trigger>
        <Box>
          <Tooltip content={StatusText}>
            <IconButton variant="ghost" color="gray" disabled={!editing} className="cursor-pointer">
              <Icon />
            </IconButton>
          </Tooltip>
        </Box>
      </Popover.Trigger>
      <Popover.Content className="max-w-none">
        <Flex direction="column" gap="2">
          <MapStatusButtons draftStatus={draftStatus} onChange={handleChangeStatus} />
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

export const MapStatusButtons: React.FC<{
  draftStatus: DraftStatus | null;
  onChange: (draftStatus: DraftStatus) => Promise<void>;
}> = ({draftStatus, onChange}) => {
  return (
    <SegmentedControl.Root value={draftStatus as string} onValueChange={onChange} size="2">
      {iconOrder.map(status => (
        <SegmentedControl.Item key={status} value={status}>
          <Flex direction="row" gap="2" align="center" justify="start">
            {statusIcons[status]({})}
            <Text>{statusText[status]}</Text>
          </Flex>
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
  );
};
