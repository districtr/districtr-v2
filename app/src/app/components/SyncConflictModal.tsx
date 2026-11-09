import React, {useState} from 'react';
import {Dialog, Button, Flex, Text, Box, Spinner, Grid, Callout} from '@radix-ui/themes';
import {Cross2Icon, InfoCircledIcon} from '@radix-ui/react-icons';
import {SyncConflictResolution} from '@constants/document/sync';
import {SyncConflictInfo} from '@/app/utils/api/apiHandlers/fetchDocument';
import {CloudIcon, LocalIcon, ForkIcon} from './SyncConflictModalIcons';
import {ConflictMapPreview} from './ConflictMapPreview';

interface SyncConflictModalProps {
  open: boolean;
  conflict: SyncConflictInfo;
  onResolve: (resolution: SyncConflictResolution) => void;
  loading: boolean;
}

type Choice = Exclude<SyncConflictResolution, SyncConflictResolution.KeepLocal>;

const CHOICES: Array<{resolution: Choice; Icon: React.FC; label: string}> = [
  {
    resolution: SyncConflictResolution.UseLocal,
    Icon: LocalIcon,
    label: 'Use this version (overwrite the cloud version)',
  },
  {
    resolution: SyncConflictResolution.UseServer,
    Icon: CloudIcon,
    label: 'Use the cloud version (overwrite this version)',
  },
  {
    resolution: SyncConflictResolution.Fork,
    Icon: ForkIcon,
    label: 'Clone this version and make a new plan (keep both)',
  },
];

/** Plain-language account of what each choice does, shown before the user commits to it. */
const outcome = (resolution: Choice, serverDate: string) => {
  switch (resolution) {
    case SyncConflictResolution.UseLocal:
      return {
        text: `The cloud version of this plan (saved ${serverDate}) will be replaced by the version on this computer. Anyone who opens this plan's link will see your version, and the changes in the cloud version can't be recovered.`,
        confirm: 'Overwrite the cloud version',
        destructive: true,
      };
    case SyncConflictResolution.UseServer:
      return {
        text: `The unsaved changes on this computer will be discarded and the map will switch to the cloud version (saved ${serverDate}). Your discarded changes can't be recovered.`,
        confirm: 'Discard my changes',
        destructive: true,
      };
    case SyncConflictResolution.Fork:
      return {
        text: `A new plan will be created from the version on this computer, with its own new link, and you'll be taken to it. The original plan keeps its cloud version (saved ${serverDate}) and its link, unchanged.`,
        confirm: 'Create the new plan',
        destructive: false,
      };
  }
};

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  conflict,
  onResolve,
  loading,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [selected, setSelected] = useState<Choice | null>(null);
  const localDate = new Date(conflict.localLastUpdated).toLocaleString();
  const serverDate = new Date(conflict.serverLastUpdated).toLocaleString();
  const selectedOutcome = selected && outcome(selected, serverDate);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={isOpen => {
        // Allow ESC / backdrop to resolve as "keep local" (same as the "I'll
        // deal with this later" action). Without onOpenChange the dialog is
        // undismissable — WAI-ARIA violation and a frozen-feeling UX.
        if (!isOpen) {
          onResolve(SyncConflictResolution.KeepLocal);
        }
      }}
    >
      <Dialog.Content maxWidth={showPreview ? '1000px' : '600px'}>
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">
            Save Conflict Detected
          </Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
            onClick={() => onResolve(SyncConflictResolution.KeepLocal)}
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box p="0">
          <Text size="3" className="block mb-4">
            You have unsaved changes on your computer.
            <br />
            <br />
            Since you last saved, other users (or you, on another device!) have made changes to this
            map.
            <br />
            <br />
            This map can only have one version. Please choose how to resolve this conflict:
          </Text>

          {loading ? (
            <Box className="flex justify-center items-center w-full h-20">
              <Spinner />
            </Box>
          ) : (
            <>
              <Grid columns="2" gap="3" className="mb-4">
                <Box className="p-3 bg-gray-50 rounded">
                  <Text size="2" weight="bold" className="block mb-2">
                    This computer&apos;s version
                  </Text>
                  <Text size="2" className="block mb-1">
                    Last updated: {localDate}
                  </Text>
                  {conflict.localDocument.map_metadata?.name && (
                    <Text size="2" className="block">
                      Name: {conflict.localDocument.map_metadata.name}
                    </Text>
                  )}
                </Box>
                <Box className="p-3 bg-gray-50 rounded">
                  <Text size="2" weight="bold" className="block mb-2">
                    Cloud version
                  </Text>
                  <Text size="2" className="block mb-1">
                    Last updated: {serverDate}
                  </Text>
                  {conflict.serverDocument.map_metadata?.name && (
                    <Text size="2" className="block">
                      Name: {conflict.serverDocument.map_metadata.name}
                    </Text>
                  )}
                </Box>
              </Grid>

              {showPreview && <ConflictMapPreview conflict={conflict} />}
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="soft"
                // Inline: Radix's button reset outranks Tailwind's sizing utilities.
                style={{width: '100%', marginBottom: 'var(--space-4)'}}
                size="2"
              >
                {showPreview ? 'Hide map comparison' : 'Compare the two maps side by side'}
              </Button>

              <Grid columns="3" gap="2">
                {CHOICES.map(({resolution, Icon, label}) => (
                  <Button
                    key={resolution}
                    onClick={() => setSelected(resolution)}
                    variant={selected === resolution ? 'solid' : 'outline'}
                    aria-pressed={selected === resolution}
                    style={{height: 'auto', paddingBlock: 'var(--space-4)'}}
                    size="3"
                  >
                    <Flex direction="column" align="center" gap="2">
                      <Icon />
                      <Text size="2">{label}</Text>
                    </Flex>
                  </Button>
                ))}
              </Grid>

              {selectedOutcome && (
                <Callout.Root
                  color={selectedOutcome.destructive ? 'red' : 'blue'}
                  className="mt-4"
                  role="status"
                >
                  <Callout.Icon>
                    <InfoCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>{selectedOutcome.text}</Callout.Text>
                </Callout.Root>
              )}

              <Flex gap="2" direction="column" className="mt-4">
                <Button
                  onClick={() => selected && onResolve(selected)}
                  disabled={!selectedOutcome}
                  color={selectedOutcome?.destructive ? 'red' : undefined}
                  className="w-full"
                  size="3"
                >
                  {selectedOutcome ? selectedOutcome.confirm : 'Choose an option above'}
                </Button>
                <Button
                  onClick={() => onResolve(SyncConflictResolution.KeepLocal)}
                  variant="outline"
                  className="w-full"
                  size="3"
                >
                  I&apos;ll deal with this later
                </Button>
              </Flex>
            </>
          )}
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};
