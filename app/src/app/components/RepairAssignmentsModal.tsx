'use client';
import {useState, type ReactNode} from 'react';
import {
  Button,
  Dialog,
  Flex,
  IconButton,
  ScrollArea,
  SegmentedControl,
  Text,
  Tooltip,
} from '@radix-ui/themes';
import {ZoomInIcon} from '@radix-ui/react-icons';
import {
  hasIssues,
  repairAssignments,
  useAssignmentRepairStore,
  zoomToGeoIds,
  type ParentRowChoice,
} from '@utils/map/assignmentIntegrity';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {useCoiAssignmentsStore} from '@store/coiAssignmentsStore';
import {MAP_MODES, MAP_MODE_LABELS} from '@constants/map/mode';

const MAX_LISTED = 50;

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Closes the modal (without dismissing it) and zooms; the population panel reopens it. */
const ZoomButton = ({geoIds, layers}: {geoIds: string[]; layers: string[]}) => {
  const [notFound, setNotFound] = useState(false);
  const label = notFound ? 'Not found on this map' : 'Zoom to this area';
  return (
    <Tooltip content={label}>
      <IconButton
        size="1"
        variant="ghost"
        aria-label={label}
        disabled={notFound}
        onClick={async () => {
          const found = await zoomToGeoIds(geoIds, layers, () =>
            useAssignmentRepairStore.setState({open: false})
          );
          if (!found) setNotFound(true);
        }}
      >
        <ZoomInIcon />
      </IconButton>
    </Tooltip>
  );
};

const Section = ({
  title,
  detail,
  count,
  children,
}: {
  title: string;
  detail: ReactNode;
  count: number;
  children: ReactNode;
}) => (
  <Flex direction="column" gap="2">
    <Text size="2" weight="bold">
      {title}
    </Text>
    <Text size="2">{detail}</Text>
    <ScrollArea type="auto" scrollbars="vertical" style={{maxHeight: 200}}>
      <Flex direction="column" gap="2" pr="3">
        {children}
        {count > MAX_LISTED && (
          <Text size="1" color="gray">
            and {(count - MAX_LISTED).toLocaleString()} more
          </Text>
        )}
      </Flex>
    </ScrollArea>
  </Flex>
);

/** Lists what the assignment check found and lets the user choose each fix. */
export const RepairAssignmentsModal = () => {
  const issues = useAssignmentRepairStore(state => state.issues);
  const open = useAssignmentRepairStore(state => state.open);
  const choices = useAssignmentRepairStore(state => state.choices);
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const [repairing, setRepairing] = useState(false);
  if (!issues || !mapDocument) return null;

  const label = MAP_MODE_LABELS[mapMode];
  const isCoi = mapMode === MAP_MODES.COI;
  const parentLayers = [mapDocument.parent_layer].filter((l): l is string => !!l);
  const anyLayers = [mapDocument.parent_layer, mapDocument.child_layer].filter(
    (l): l is string => !!l
  );
  // Read at render: the modal's lists are a snapshot of the check, not live state.
  const {parentToChild} = isCoi
    ? useCoiAssignmentsStore.getState()
    : useAssignmentsStore.getState();
  const describe = (ids: Iterable<string>) => {
    const idList = Array.from(ids);
    if (isCoi) {
      const {communityAssignments} = useCoiAssignmentsStore.getState();
      const names = useMapStore
        .getState()
        .communities.filter(community =>
          idList.some(id => communityAssignments.get(community.id)?.has(id))
        )
        .map(community => community.name);
      return names.length ? names.join(', ') : 'no community';
    }
    const {zoneAssignments} = useAssignmentsStore.getState();
    const zones = Array.from(
      new Set(
        idList.map(id => zoneAssignments.get(id)).filter((zone): zone is number => zone != null)
      )
    ).sort((a, b) => a - b);
    if (!zones.length) return 'unassigned';
    return `${zones.length === 1 ? 'District' : 'Districts'} ${zones.join(', ')}`;
  };
  const setChoice = (parent: string, choice: ParentRowChoice) =>
    useAssignmentRepairStore.setState({choices: {...choices, [parent]: choice}});
  const setAllChoices = (choice: ParentRowChoice) =>
    useAssignmentRepairStore.setState({
      choices: Object.fromEntries(issues.parentRows.map(parent => [parent, choice])),
    });
  const missingBlockTotal = Array.from(issues.missingBlocks.values()).reduce(
    (sum, blocks) => sum + blocks.length,
    0
  );
  const close = () =>
    useAssignmentRepairStore.setState({open: false, dismissedFor: mapDocument.document_id});
  const handleRepair = async () => {
    setRepairing(true);
    try {
      await repairAssignments();
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={next => !next && close()}>
      <Dialog.Content maxWidth="620px">
        <Dialog.Title>This map has assignments to repair</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          Population totals can&apos;t be calculated until these are fixed, and the map won&apos;t
          save. Choose how to fix each area, then repair. Only the rows listed here change.
        </Dialog.Description>
        <Flex direction="column" gap="4">
          {issues.parentRows.length > 0 && (
            <Section
              title={`${plural(issues.parentRows.length, 'broken-up area is', 'broken-up areas are')} also saved as a whole`}
              detail={
                <>
                  Keep the blocks&apos; own {label}s, or use the whole area&apos;s {label} (its
                  blocks are dropped and it&apos;s no longer broken up).
                </>
              }
              count={issues.parentRows.length}
            >
              <Flex gap="2" align="center">
                <Text size="1" color="gray">
                  Set all:
                </Text>
                <Button size="1" variant="soft" onClick={() => setAllChoices('blocks')}>
                  Keep blocks
                </Button>
                <Button size="1" variant="soft" onClick={() => setAllChoices('whole')}>
                  Use whole area
                </Button>
              </Flex>
              {issues.parentRows.slice(0, MAX_LISTED).map(parent => (
                <Flex key={parent} align="center" justify="between" gap="3">
                  <Flex direction="column">
                    <Text size="1" weight="medium">
                      {parent}
                    </Text>
                    <Text size="1" color="gray">
                      Whole area: {describe([parent])} · Blocks:{' '}
                      {describe(parentToChild.get(parent) ?? [])}
                    </Text>
                  </Flex>
                  <Flex align="center" gap="2" flexShrink="0">
                    <SegmentedControl.Root
                      size="1"
                      value={choices[parent] ?? 'blocks'}
                      onValueChange={value => setChoice(parent, value as ParentRowChoice)}
                    >
                      <SegmentedControl.Item value="blocks">Keep blocks</SegmentedControl.Item>
                      <SegmentedControl.Item value="whole">Use whole area</SegmentedControl.Item>
                    </SegmentedControl.Root>
                    <ZoomButton geoIds={[parent]} layers={parentLayers} />
                  </Flex>
                </Flex>
              ))}
            </Section>
          )}
          {missingBlockTotal > 0 && (
            <Section
              title={`${plural(missingBlockTotal, 'block is', 'blocks are')} missing from broken-up areas`}
              detail={`They're added back with the whole area's ${label} when you keep its blocks, otherwise unassigned.`}
              count={issues.missingBlocks.size}
            >
              {Array.from(issues.missingBlocks)
                .slice(0, MAX_LISTED)
                .map(([parent, blocks]) => (
                  <Flex key={parent} align="center" justify="between" gap="3">
                    <Text size="1">
                      {parent}: {plural(blocks.length, 'block', 'blocks')}
                    </Text>
                    <ZoomButton geoIds={[parent]} layers={parentLayers} />
                  </Flex>
                ))}
            </Section>
          )}
          {issues.unmatched.length > 0 && (
            <Section
              title={`${plural(issues.unmatched.length, 'assigned area isn’t', 'assigned areas aren’t')} in this map's population data`}
              detail="These rows are removed."
              count={issues.unmatched.length}
            >
              {issues.unmatched.slice(0, MAX_LISTED).map(id => (
                <Flex key={id} align="center" justify="between" gap="3">
                  <Text size="1">
                    {id}: {describe([id])}
                  </Text>
                  <ZoomButton geoIds={[id]} layers={anyLayers} />
                </Flex>
              ))}
            </Section>
          )}
          {issues.unverified.length > 0 ? (
            <Text size="2" color="gray">
              Couldn&apos;t check the blocks of{' '}
              {plural(issues.unverified.length, 'broken-up area', 'broken-up areas')}.
            </Text>
          ) : (
            missingBlockTotal === 0 && (
              <Text size="2" color="gray">
                Checked: every broken-up area has all of its blocks.
              </Text>
            )
          )}
        </Flex>
        <Flex gap="3" mt="4" justify="end">
          <Button variant="soft" color="gray" onClick={close} disabled={repairing}>
            Not now
          </Button>
          <Button
            color="red"
            onClick={handleRepair}
            loading={repairing}
            disabled={!hasIssues(issues)}
          >
            Repair and save
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
