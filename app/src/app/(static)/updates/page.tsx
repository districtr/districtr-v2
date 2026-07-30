import {Flex, Heading, Link, Text} from '@radix-ui/themes';
import {LEGACY_DISTRICTR_URL} from '../../constants/legacy';

export default function UpdatesPage() {
  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1" size="8">
        Updates
      </Heading>
      <Heading as="h2" size="5" className="text-balance max-w-prose">
        After many years of faithful service and thousands of community-based maps drawn, Districtr
        has been rebuilt from the ground up — and the new Districtr now lives here at districtr.org!
      </Heading>
      <Text size="3">
        The original Districtr, and all previously drawn maps, remain available at{' '}
        <Link href={LEGACY_DISTRICTR_URL} target="_blank">
          legacy.districtr.org
        </Link>
        .
      </Text>
      <Text size="3">New and notable features include:</Text>
      <ul className="list-disc leading-7 pl-4">
        <li>Coverage for all 50 states, DC, and Puerto Rico.</li>
        <li>
          Block-level detail: the ability to take a precinct and &quot;shatter&quot; it into its
          component Census blocks. This lets you draw maps with very tight population deviation.
        </li>
        <li>
          Community of Interest (COI) mapping mode, with a coalition builder for viewing stats about
          combined demographic groups.
        </li>
        <li>An evaluation view with district metrics.</li>
        <li>
          Map validation: contiguity checks that let you zoom to components, and finding unassigned
          units even while zoomed out.
        </li>
        <li>
          Demographics and elections: view choropleths (shaded maps) side-by-side or overlaid, with
          adjustable and continuous shading scales.
        </li>
        <li>
          Import/export: improved block assignment imports that automatically recognize the right
          map, and a full export overhaul.
        </li>
        <li>Save/share: share plans in an editable or a view-only version.</li>
        <li>A dedicated page to manage your saved maps.</li>
        <li>Customizable district colors and locking of individual districts.</li>
        <li>Hotkeys/keyboard shortcuts: P to paint, M to move, etc.</li>
        <li>A draggable and resizable toolbar.</li>
      </ul>
      <Text size="3">
        For the full development history, see the <Link href="/changelog">changelog</Link>.
      </Text>
    </Flex>
  );
}
