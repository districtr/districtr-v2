import {Flex, Heading, Text} from '@radix-ui/themes';

export default function UpdatesPage() {
  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1" size="8">
        Updates
      </Heading>
      <Heading as="h2" size="5" className="text-balance max-w-prose">
        After many years of faithful service and thousands of community-based maps drawn, Districtr
        is getting a makeover in 2025!
      </Heading>
      <Text size="3">New/notable features include:</Text>
      <ul className="list-disc leading-7 pl-4">
        <li>
          Block-level detail: the ability to take a precinct and &quot;shatter&quot; it into its
          component Census blocks. This lets you draw maps very tight population deviation.
        </li>
        <li>Hotkeys/keyboard shortcuts: P to paint, M to move, etc.</li>
        <li>Save/share: You can share in an editable or a view-only version.</li>
        <li>Customizable district colors.</li>
        <li>
          Map validation:
          <ul className="list-disc leading-7 pl-4">
            <li>Contiguity check lets you zoom to components.</li>
            <li>Find unassigned units.</li>
          </ul>
        </li>
        <li>Draggable and resizable toolbar.</li>
        <li>
          Import/export: we already had block assignment exports, but now we have improved block
          assignment imports.
        </li>
        <li>
          Demographics and elections: new viewing options let you see choropleths (shaded or colored
          maps) side-by-side or overlaid. There is also adjustable binning for the shading.
        </li>
        <li>Locking individual districts.</li>
      </ul>
    </Flex>
  );
}
