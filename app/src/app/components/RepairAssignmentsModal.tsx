'use client';
import {useState, type ReactNode} from 'react';
import {
  Button,
  Callout,
  Dialog,
  Flex,
  IconButton,
  ScrollArea,
  SegmentedControl,
  Text,
  Tooltip,
} from '@radix-ui/themes';
import {ExclamationTriangleIcon, ZoomInIcon} from '@radix-ui/react-icons';
import {
  checkAssignments,
  hasIssues,
  repairAssignments,
  zoomToGeoIds,
} from '@utils/map/assignmentIntegrity';
import {useAssignmentRepairStore, type ParentRowChoice} from '@store/assignmentRepairStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {useCoiAssignmentsStore} from '@store/coiAssignmentsStore';
import {MAP_MODES, MAP_MODE_LABELS} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

const MAX_LISTED = 50;

/**
 * The last check's issues, if they belong to the open document and it's editable;
 * issues left over from another document (or a read-only view) never show.
 */
export const useCurrentRepairIssues = () => {
  const issues = useAssignmentRepairStore(state => state.issues);
  const documentId = useMapStore(state => state.mapDocument?.document_id);
  const access = useMapStore(state => state.mapDocument?.access);
  return issues && issues.documentId === documentId && access === ACCESS_STATES.EDIT
    ? issues
    : null;
};

/** Reopens the modal with the last check's results, or runs a fresh check. */
export const openRepair = (hasCurrentIssues: boolean) =>
  hasCurrentIssues ? useAssignmentRepairStore.setState({open: true}) : checkAssignments('manual');

/**
 * The one alert for a map with assignments to fix, and the way back into the modal
 * after "Not now" or zooming to a unit. It sits in the shared sidebar so it shows
 * on every tab and on community maps (which have no population panel).
 */
export const RepairAssignmentsCallout = () => {
  const issues = useCurrentRepairIssues();
  const open = useAssignmentRepairStore(state => state.open);
  if (!issues || open || !hasIssues(issues)) return null;
  return (
    <Callout.Root color="red" size="1" role="alert">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>
        Something went wrong with this map&apos;s assignments. Population totals and saving are
        paused until you fix it.
      </Callout.Text>
      <Button size="1" color="red" variant="soft" onClick={() => openRepair(true)}>
        Review and fix
      </Button>
    </Callout.Root>
  );
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Closes the modal (without dismissing it) and zooms; RepairAssignmentsCallout reopens it. */
const ZoomButton = ({geoIds, layers}: {geoIds: string[]; layers: string[]}) => {
  const [notFound, setNotFound] = useState(false);
  const label = notFound ? 'Not on this map' : 'Zoom to this unit';
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
  const issues = useCurrentRepairIssues();
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
        <Dialog.Title>Something went wrong with this map&apos;s assignments</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          Until you fix the units below, population totals won&apos;t show and the map won&apos;t
          save.
        </Dialog.Description>
        <Flex direction="column" gap="4">
          {issues.parentRows.length > 0 && (
            <Section
              title={`${plural(issues.parentRows.length, 'unit was', 'units were')} saved both whole and as blocks`}
              detail={`Choose one for each. Keep blocks keeps each block's own ${label}. Keep whole unit gives all of it the whole unit's ${label} and removes its blocks.`}
              count={issues.parentRows.length}
            >
              <Flex gap="2" align="center">
                <Text size="1" color="gray">
                  Set all to:
                </Text>
                <Button size="1" variant="soft" onClick={() => setAllChoices('blocks')}>
                  Keep blocks
                </Button>
                <Button size="1" variant="soft" onClick={() => setAllChoices('whole')}>
                  Keep whole unit
                </Button>
              </Flex>
              {issues.parentRows.slice(0, MAX_LISTED).map(parent => (
                <Flex key={parent} align="center" justify="between" gap="3">
                  <Flex direction="column">
                    <Text size="1" weight="medium">
                      {parent}
                    </Text>
                    <Text size="1" color="gray">
                      Whole: {describe([parent])} · Blocks:{' '}
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
                      <SegmentedControl.Item value="whole">Keep whole unit</SegmentedControl.Item>
                    </SegmentedControl.Root>
                    <ZoomButton geoIds={[parent]} layers={parentLayers} />
                  </Flex>
                </Flex>
              ))}
            </Section>
          )}
          {missingBlockTotal > 0 && (
            <Section
              title={`${plural(missingBlockTotal, 'block is', 'blocks are')} missing`}
              detail={`They'll be added back, with the whole unit's ${label} if it has one.`}
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
              title={`${plural(issues.unmatched.length, 'assigned unit has', 'assigned units have')} no population data`}
              detail={
                issues.unmatched.length === 1
                  ? "It'll be removed from the map."
                  : "They'll be removed from the map."
              }
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
              Couldn&apos;t check {plural(issues.unverified.length, 'unit', 'units')} for missing
              blocks.
            </Text>
          ) : (
            missingBlockTotal === 0 && (
              <Text size="2" color="gray">
                No blocks are missing.
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
            Fix and save
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
