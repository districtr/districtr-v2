'use client';
import {Text, Flex, IconButton, Box, Tooltip, Popover, SegmentedControl} from '@radix-ui/themes';
import {useState} from 'react';
import {DocumentMetadata, DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {
  DRAFT_STATUSES,
  type DraftStatus,
  DRAFT_STATUS_TEXT,
  DRAFT_STATUS_ORDER,
} from '@constants/document/draftStatus';
import {InProgressIcon, ScratchWorkIcon, ReadyIcon} from './Icons';

const statusIcons: Record<DraftStatus, React.FC> = {
  [DRAFT_STATUSES.SCRATCH]: ScratchWorkIcon,
  [DRAFT_STATUSES.IN_PROGRESS]: InProgressIcon,
  [DRAFT_STATUSES.READY_TO_SHARE]: ReadyIcon,
};

export const MapStatus: React.FC<{
  mapDocument: DocumentObject | null;
  mapMetadata: DocumentMetadata | null;
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({mapDocument, mapMetadata, handleMetadataChange}) => {
  const draftStatus = mapMetadata?.draft_status ?? DRAFT_STATUSES.SCRATCH;
  const Icon = statusIcons[draftStatus];
  const statusText = DRAFT_STATUS_TEXT[draftStatus];
  const editing = mapDocument?.access === 'edit';
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
          <Tooltip content={statusText}>
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
      {DRAFT_STATUS_ORDER.map(status => (
        <SegmentedControl.Item key={status} value={status}>
          <Flex direction="row" gap="2" align="center" justify="start">
            {statusIcons[status]({})}
            <Text>{DRAFT_STATUS_TEXT[status]}</Text>
          </Flex>
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
  );
};
