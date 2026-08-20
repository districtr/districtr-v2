import {CTA} from '@/app/components/Static/Content/CTA';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {Flex, Heading, Text} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';
import {GuideToc, type GuideTocEntry} from '@/app/components/Static/GuideToc';
import {slugify} from '@/app/utils/slugify';

const TOC_ENTRIES: GuideTocEntry[] = [
  {title: 'Getting Started With Districts'},
  {
    title: 'Main Tools',
    subsections: ['Moving across the map', 'Drawing the districts'],
  },
  {
    title: 'Data Tabs',
    subsections: ['Population', 'Stats', 'Map Layers'],
  },
  {title: 'Map Modes'},
  {
    title: 'Saving, Sharing, Importing, & Exporting',
    subsections: [
      'Edit map names and details',
      'Sharing your Map',
      'Importing Maps',
      'Exporting Maps',
    ],
  },
  {
    title: 'Super Draw',
    subsections: ['Additional tools', 'Additional controls', 'Additional display options'],
  },
];

/** Anchor id + scroll-offset props for a subheading, so it lines up with its GuideToc link. */
const subheadingAnchor = (title: string) => ({id: slugify(title), className: 'scroll-mt-28'});

export const metadata = {
  title: 'Guide',
  description: 'How to draw districting and community maps with Districtr',
};

export default function GuidePage() {
  return (
    <Flex direction="row" gapX="6" align="start">
      <GuideToc entries={TOC_ENTRIES} />
      <Flex direction="column" gapY="4" className="min-w-0 flex-1">
        <LearnSubNav />
        <ContentSection title="Getting Started With Districts">
          <Flex direction="column" gapY="4">
            <Text size="3">
              On the Districtr homepage, click “Draw” in the top right corner. You will be
              redirected to an interactive map of the United States. Click the state that you wish
              to redistrict. All 50 states are available, as well as Washington, D.C. and Puerto
              Rico.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/draw_menu.webm`}
            />
            <Text size="3">
              Once you have selected a state, you will be directed to its landing page. The landing
              page contains mapping options along with background information. Choose a locality
              (state, region, county, or city) and a districting level by clicking on a card. The
              available localities and districts vary by state. (Additional localities can usually
              be added upon request.)
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/select_module.webm`}
            />
          </Flex>
        </ContentSection>
        <ContentSection title="Main Tools">
          <Flex direction="column" gapY="4">
            <Heading as="h3" size="4" {...subheadingAnchor('Moving across the map')}>
              Moving across the map
            </Heading>

            <Text size="3">
              Select the hand icon on the toolbar at the top of the side panel, on the right of the
              map. Then click and drag to pan across the map.
            </Text>
            <Text size="3">
              To zoom in and out, use the plus and minus buttons in the bottom right corner of the
              map, or use whatever mouse/trackpad controls you are accustomed to in other mapping
              apps.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/moving_in_map.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Drawing the districts')}>
              Drawing the districts
            </Heading>

            <Text size="3">
              To start drawing your first district, select the paintbrush icon on the toolbar at the
              top of the side panel. Click and drag on the map to add units to your district.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/drawing_on_map.webm`}
            />
            <Text size="3">
              To draw another district, select a new color from the color samples. Each color
              corresponds to a different district. For pages with large numbers of districts, colors
              will appear one at a time when you start new districts. For these, use the dropdown
              menu to select a different color.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/drawing_another_district.webm`}
            />
            <Text size="3">
              To change the size of the brush, drag the brush size slider directly above the color
              bar.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/brush_size.webm`}
            />
            <Text size="3">
              The “Paint by county” option will assign entire counties at a time, and this is on as
              the default setting to help you get started. To paint units smaller than counties,
              uncheck the box next to the slider.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/county_brush.webm`}
            />
            <Text size="3">
              To avoid painting over already-drawn areas, check the “Forbid paint-over” box next to
              the district selector.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/district_forbid_paintover.webm`}
            />
            <Text size="3">
              To correct the boundaries of your districts, click the erase icon on the toolbar at
              the top of the side panel. Click and drag to remove units from that district. The size
              of the eraser can be adjusted by dragging the slider.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/eraser.webm`}
            />
            <Text size="3">
              Click the “undo/redo” buttons to move your edits backward or forward in time.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/undo_redo.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Data Tabs">
          <Flex direction="column" gapY="4">
            <Heading as="h3" size="4" {...subheadingAnchor('Population')}>
              Population
            </Heading>

            <Text size="3">
              The “Population” tab lists the districts — click a district number to select it and
              switch the brush to that district's color (or type the number of the district on your
              keyboard as a shortcut). The tab also shows the population of each district; to
              balance your population evenly between districts, refer to the ideal population count
              provided in this panel (shown visually with a vertical bar).
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/district_overview.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Stats')}>
              Stats
            </Heading>
            <Text size="3">
              Under the “Stats” tab, you can check whether your map is complete (i.e., no units are
              left unassigned).
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/completeness_check.webm`}
            />
            <Text size="3">
              You can also check whether your districts are contiguous (i.e., each district is a
              single connected piece).
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/contiguity_check.webm`}
            />
            <Text size="3">
              The “Stats” tab also contains the demographic and election tables. Under demographics,
              you can access race and ethnicity data from the Census, as well as toggle between
              total population and voting age population (over 18). Election data lets you see how
              your districts would have behaved under the voting patterns of recent elections.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/tables_under_stats.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Map Layers')}>
              Map Layers
            </Heading>
            <Text size="3">
              The “Map Layer” tab allows you to view additional data visually on the map. Under
              demographics, choose “Shaded regions” to show a selected demographic variable by
              shading the units on the map. (Geographers call this a choropleth map.) Alternatively,
              choose “Sized circles” to show round shapes whose size tells you how many people are
              in the unit, while shading tells you the percentage in your chosen category.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/demographics_display.webm`}
            />

            <Text size="3">
              Viewing elections gives you the same display options of “Shaded regions” and “Sized
              circles.”
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/election_display.webm`}
            />

            <Text size="3">
              The last section of the “Map Layer” tab lists a number of helpful controls. For
              instance, you can uncheck “Painted districts” to hide the districts from the map,
              toggle “County Boundaries” to show or remove county boundaries, and check “Highlight
              unassigned areas” to see which units are waiting to be painted.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/visual_settings.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Map Modes">
          <Flex direction="column" gapY="4">
            <Text size="3">
              The “Mode” switcher in the top bar lets you move between different ways of working
              with your map: <b>Draw</b>, <b>Super Draw</b>, <b>View</b>, and <b>Evaluate</b>.
              Switching from Draw or Super Draw to View or Evaluate will result in the creation of a
              shareable link. Draw is the most accessible mode for building maps, and it's explained
              above. (Super Draw is largely for advanced users and we'll expand on its features
              below.)
            </Text>
            <Text size="3">
              <b>View mode</b> shows your map without any of the editing tools. This is the mode
              that others will start in when you share a public link to your map.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/view_mode.webm`}
            />
            <Text size="3">
              <b>Evaluate mode</b> lists some recommended and/or popular scores and metrics for your
              plan. You can think of this as a report on your plan. Here, you can see whether a plan
              is complete, contiguous, and population-balanced, as well as getting scores of
              compactness (district shape), county integrity (splits and pieces), and partisan
              balance (lean towards one political party or the other).
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/evaluation_mode.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Saving, Sharing, Importing, & Exporting">
          <Flex direction="column" gapY="4">
            <Heading as="h3" size="4" {...subheadingAnchor('Edit map names and details')}>
              Edit map names and details
            </Heading>
            <Text size="3">
              Your map automatically saves as you work, right in your browser's local storage — no
              account or login needed. Clicking the map title at the middle of the top bar allows
              you to edit the map name and put comments on the map. There is also a Map Status field
              where you can designate your map as Scratch Work, In Progress, or Ready to Share.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/edit_metadata.webm`}
            />
            <Text size="3">
              The “Catalog” from the main page stores all your maps, which allows you to switch
              between different maps you have worked on. These maps are stored in your browser's
              local storage — no account or login needed. They will be removed when you clear your
              browser data. You can go there at any time from the navigational menu of the
              “Districtr” icon.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/map_catalog.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Sharing your Map')}>
              Sharing your Map
            </Heading>
            <Text size="3">
              Clicking the “Share” button allows you to create a link to the map. You can share a
              “frozen” link (simple URL, intended for viewing) or an “editable” link (private ID in
              the URL, password optional).
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/share_map.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Importing Maps')}>
              Importing Maps
            </Heading>
            <Text size="3">
              Districtr allows users to import maps from block assignment files in CSV format — this
              is basically a spreadsheet format where one column contains an identifier for each
              geographic unit, and the other column says what district that unit is assigned to.
              This is a standard format available in other mapping software, like Maptitude and DRA.
              From either the Draw or Catalog/My District Plans, you'll find a link at the upper
              right to “Upload block assignments.”
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/import.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Exporting Maps')}>
              Exporting Maps
            </Heading>
            <Text size="3">
              Districtr provides the option to export a map in several formats. The most compatible
              format with other platforms is a block assignment file (formatted as a CSV) which
              assigns census blocks to districts. Click on the “Map Action” menu in the upper right
              corner of the map and select “Export assignments/Block assignments.” Alternatively,
              you can export your district shapes as a GeoJSON or a shapefile, or you can export
              evaluation metrics as a JSON file.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/export.webm`}
            />
          </Flex>
        </ContentSection>

        <CTA />
        <ContentSection title="Super Draw">
          <Flex direction="column" gapY="4">
            <Text size="3">
              You now know everything you need to draw and share a plan — but if you want to go
              further, <b>Super Draw</b> mode unlocks additional tools for fine-tuning your
              districts. You get there from the same “Mode” switcher described above.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/switch_mode.webm`}
            />
            <Heading as="h3" size="4" {...subheadingAnchor('Additional tools')}>
              Additional tools
            </Heading>
            <Text size="3">
              If you need to use smaller units of geography to balance the population of your
              districts, click the break icon on the toolbar. Then click on a unit you want to break
              down to smaller pieces, which allows you to paint individual blocks within the
              precinct or block group. You can see the population numbers on the blocks from the
              pop-up below, or by selecting the “Population labels on exposed blocks” option under
              the “Map Layers” tab.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/shatter.webm`}
            />
            <Text size="3">
              Super Draw mode enables the “Inspect” tool. For any precinct, block group, or broken
              block, you can view its voting age population or total population for a range of
              ethnic groups, or voter history information for a range of elections. Simply hover
              your mouse over the unit to see its associated demographic or election data.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/inspect.webm`}
            />
            <Heading as="h3" size="4" {...subheadingAnchor('Additional controls')}>
              Additional controls
            </Heading>
            <Text size="3">
              Under the “Population” tab, Super Draw allows you to lock districts, which prevents
              them from being painted over or erased.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/lock_district.webm`}
            />
            <Text size="3">
              Under “Map Layers/Boundaries and areas,” Super Draw allows you to restrict your
              painting to a county, a metro area, or any other area type available for the map.
              Similar to the break tool's workflow, you mask an area by clicking the mask button
              next to the toggle for its area type and selecting that area on the map.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/mask_area.webm`}
            />
            <Text size="3">
              In Super Draw mode, you may switch the layout of the side panel itself between a
              stacked layout and the default layout consisting of three tabs.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_stacked_layout.webm`}
            />
            <Heading as="h3" size="4" {...subheadingAnchor('Additional display options')}>
              Additional display options
            </Heading>
            <Text size="3">
              Super Draw mode allows you to change whether the population statistic is displayed by
              share or by count: under the “Stats” tab, click the gear icon to the right of “Summary
              Type” and choose “Population by Share” or “Population by Count.” For the demographic
              table, you may choose a customized coalition (for instance, Black plus Hispanic
              people) to be displayed as an additional column in the table.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_number_format.webm`}
            />
            <Text size="3">
              Super Draw mode also allows you to switch on a side-by-side demographic and elections
              viewing option instead of an overlay. For shaded overlay, you can adjust the opacity
              of the district layer. Given a specific variable, you now have the option of showing
              absolute population number, in addition to the default option of population share.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_side_by_side.webm`}
            />
            <Text size="3">
              More map display options are available in Super Draw mode under “Map Layers/Map
              Options,” including the option to choose street map or satellite map as the base
              layer, the option to show population labels on all units, and the option to highlight
              broken precincts. You can also customize your color palette for districts.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_visual_options.webm`}
            />
          </Flex>
        </ContentSection>
      </Flex>
    </Flex>
  );
}
