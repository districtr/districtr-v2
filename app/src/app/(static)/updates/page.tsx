import {Flex, Heading, Text} from '@radix-ui/themes';

export default function UpdatesPage() {
  return (
    <Flex className="w-full mx-auto max-w-screen-lg" direction="column" gapY="4">
      <Heading as="h1" size="8">
        Updates
      </Heading>
      <Heading as="h2" size="5" className="text-balance max-w-prose">
        After many years of faithful service, and thousands of community based maps drawn, we
        decided that districtr needed a revamp. On the backend, our team implemented the latest and
        greatest in GIS packages. This allowed us to implement tons of exciting new features in v2,
        as well as set us up for long term success maintaining and upgrading the site!
      </Heading>
      <Text size="3">New/notable features include:</Text>
      <ul className="list-disc leading-7 pl-4">
        <li>Paint by county: use the brush to paint entire counties at once.</li>
        <li>
          Save/share: share a link to your map. You can share a version that collaborators can edit,
          or a view only version.{' '}
        </li>
        <li>Custom district colors. </li>
        <li>Draggable and resizable toolbar. </li>
        <li>
          Precinct shattering: the ability to take a precinct and &quot;shatter it&quot; into its
          component Census blocks. This helps you draw maps with +/- 1 population deviation.{' '}
        </li>
        <li>
          Importing/exporting maps: users can upload maps from other sources as block level
          assignment files. Users can export maps as block assignment files.{' '}
        </li>
        <li>
          Map validation: check that your map has assigned all of the necessary geographic units, as
          well as check that each district is connected. There is now a zoom feature which will take
          you to any problem areas in the map.{' '}
        </li>
        <li>
          Demographics: evaluate your map&apos;s districts using demographic data from the Census.{' '}
        </li>
        <li>Elections: evaluate your map&apos;s districts using recent election data. </li>
      </ul>
    </Flex>
  );
}
