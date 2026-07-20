import {CTA} from '@/app/components/Static/Content/CTA';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';
import {GuideToc, type GuideTocEntry} from '@/app/components/Static/GuideToc';
import {slugify} from '@/app/utils/slugify';

const TOC_ENTRIES: GuideTocEntry[] = [
  {title: 'Getting Started With Districts'},
  {
    title: 'Main Tools',
    subsections: ['Moving across the map', 'Drawing the districts', 'Visual settings'],
  },
  {
    title: 'Data Panels',
    subsections: ['District overview', 'Demographics', 'Elections', 'Map Validation'],
  },
  {title: 'Map Modes'},
  {
    title: 'Saving, Sharing, Importing & Exporting',
    subsections: ['Saving your Map', 'Sharing your Map', 'Importing Maps', 'Exporting Maps'],
  },
  {title: 'Super Draw'},
];

/** Anchor id + scroll-offset props for a subheading, so it lines up with its GuideToc link. */
const subheadingAnchor = (title: string) => ({id: slugify(title), className: 'scroll-mt-28'});

export default function GuidePage() {
  return (
    <Flex direction="row" gapX="6" align="start">
      <GuideToc entries={TOC_ENTRIES} />
      <Flex direction="column" gapY="4" className="min-w-0 flex-1">
        <LearnSubNav />
        <Box>
          <Heading size="8" as="h1">
            Tutorial
          </Heading>
        </Box>
        <ContentSection title="Getting Started With Districts">
          <Flex direction="column" gapY="4">
            <Text size="3">
              On the Districtr homepage, click “Draw” in the top right corner. You will be
              redirected to an interactive map of the United States. Click the state for which you
              wish to redistrict. All states are available, as well as Washington, D.C. and Puerto
              Rico.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/draw_menu.webm`}
            />
            <Text size="3">
              Once you have selected a state, you will be directed to its landing page. The landing
              page contains all mapping options along with background information. Choose a locality
              (state, region, county, or city) and district type by clicking on a card. The
              available localities and districts vary by state. (Additional localities can be added
              upon request.)
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/select_module.webm`}
            />
            <Text size="3">You will now be redirected to your selected districting page.</Text>
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
              map. You can also use a mouse scroll wheel or trackpad.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/moving_in_map.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Drawing the districts')}>
              Drawing the districts
            </Heading>

            <Text size="3">
              To draw your first district, select the paintbrush icon on the toolbar at the top of
              the side panel. Click and drag on the map to add units to your district.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/drawing_on_map.webm`}
            />
            <Text size="3">
              To draw another district, select a new color from the color bar that appears when you
              click the paint icon. Each color corresponds to a different district. For pages with
              large numbers of districts, only one color will show when you start. For these, use
              the dropdown menu to select a different color.
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
              To paint whole counties at once, toggle the “County Brush” box next to the slider.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/county_brush.webm`}
            />
            <Text size="3">
              To inspect districts without altering them, or to avoid painting over already-drawn
              areas, toggle the lock icon next to the district number in the “District overview”
              panel.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/district_lock.webm`}
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
              Click the “undo/redo” buttons to revert the boundaries of your district plan to a
              previous version.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/undo_redo.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Visual settings')}>
              Visual settings
            </Heading>
            <Text size="3">
              Click the gear icon (“Visual settings”) at the top of the side panel to control what
              the map shows. From here, you can uncheck “Painted districts” to hide the districts
              from the map, toggle “County Boundaries” to show or remove county boundaries, and
              check “Highlight unassigned areas” to see which units you still need to color.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/visual_settings.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Data Panels">
          <Flex direction="column" gapY="4">
            <Heading as="h3" size="4" {...subheadingAnchor('District overview')}>
              District overview
            </Heading>

            <Text size="3">
              The “District overview” panel lists each drawn district — click a district number to
              select it and switch the brush to that district's color. It also shows the population
              of each district; to balance your population evenly between districts, make reference
              to the ideal population count and vertical bar provided in this panel. You may also
              add comments to each district by clicking the comment icon next to the district
              number.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/district_overview.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Demographics')}>
              Demographics
            </Heading>
            <Text size="3">
              Under this panel, you can study the demographic make up of your districts:
            </Text>
            <ul className="list-disc pl-6">
              <li>
                <Text size="3">
                  Choose total population or voting age population as the statistic.
                </Text>
              </li>
              <li>
                <Text size="3">
                  Under the “Map Layer” tab, view the demographic data as a choropleth on top of the
                  map by selecting “Overlay” under “Display Modes”, or as sized circles by selecting
                  “Sized Circles”.
                </Text>
              </li>
            </ul>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/demographics_panel.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Elections')}>
              Elections
            </Heading>
            <Text size="3">
              In the elections panel you can view how your districts would have behaved under past
              election data. Just like the demographics panel, you can choose to view the election
              data as a choropleth on top of the map by selecting “Overlay” under “Display Modes”,
              or view it as sized circles by selecting “Sized Circles”.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/election_panel.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Map Validation')}>
              Map Validation
            </Heading>
            <Text size="3">
              Under the map validation panel, you can check whether your map is missing any
              geographic units.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/completeness_check.webm`}
            />
            <Text size="3">You can also check whether your districts are contiguous.</Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/contiguity_check.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Map Modes">
          <Flex direction="column" gapY="4">
            <Text size="3">
              The “Mode” switcher in the top bar lets you move between different ways of working
              with your map: <b>Draw</b> for building your plan, <b>View</b> for a clean read-only
              display of it, and <b>Evaluate</b> for a dashboard of statistics about it. (There’s
              also a <b>Super Draw</b> mode with extra drawing tools for more advanced users — more
              on that at the end of this guide.) Switching to View or Evaluate works from a
              shareable link to your map; if you haven’t shared your map yet, Districtr
              automatically creates that shareable version for you the first time you switch, so you
              never have to leave the editor to set it up.
            </Text>
            <Text size="3">
              <b>View mode</b> shows your map without any of the editing tools. This is the view
              others see when you share a public link to your map.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/view_mode.webm`}
            />
            <Text size="3">
              <b>Evaluate mode</b> lists commonly used evaluation metrics for your plan. You can see
              whether your plan is complete, contiguous, and population-balanced, as well as how
              compact its districts are and how much it favors a party given past election data.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/evaluation_mode.webm`}
            />
          </Flex>
        </ContentSection>

        <ContentSection title="Saving, Sharing, Importing & Exporting">
          <Flex direction="column" gapY="4">
            <Heading as="h3" size="4" {...subheadingAnchor('Saving your Map')}>
              Saving your Map
            </Heading>
            <Text size="3">
              Your map automatically saves as you work, right in your browser's local storage — no
              account or login needed. Clicking the map title at the middle of the top bar allows
              you to edit the map name and any comments about the map. Optionally, you can toggle
              your map from a draft to “Ready to Share” if you are fully finished.
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
              Clicking the “Share” button saves the map you created and allows you to share a link
              to the map. You can either share a frozen link, which does not allow editing of the
              original map, or an editable link, which only allows people with a password to edit.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/share_map.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Importing Maps')}>
              Importing Maps
            </Heading>
            <Text size="3">
              Districtr allows users to import maps from CSV block assignment files. Click on the
              Districtr menu in the upper left corner and select “Create new map” and then “Upload
              block assignments”. From here, upload your assignment file.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/import.webm`}
            />

            <Heading as="h3" size="4" {...subheadingAnchor('Exporting Maps')}>
              Exporting Maps
            </Heading>
            <Text size="3">
              Districtr provides the option to export a map in several formats. The most compatible
              format with other platforms is a CSV assignment file which maps Census blocks to
              districts. Click on the “Map Action” menu in the upper right corner of the map and
              select “Export assignments”, then “Block assignments”. Alternatively, you can also
              export your district shapes as a GeoJSON or a shapefile, or export evaluation metrics
              as a JSON file.
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
              districts. Switch into it from the same “Mode” menu described above.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/switch_mode.webm`}
            />
            <Text size="3">
              If you need to use smaller units of geography to balance the population of your
              districts, click the break icon on the toolbar at the top of the side panel. Then
              click on a unit you want to “break”, allowing you to paint subsets of the original
              unit. You can see the population number of each broken piece by clicking the gear icon
              in the upper right corner of the map and selecting “Show total population labels on
              blocks”.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/shatter.webm`}
            />
            <Text size="3">
              Super Draw allows you to change whether the population statistic is displayed by share
              or by count: click the gear icon to the right of “Summary Type” and choose “Population
              by Share” or “Population by Count”. The Super Draw mode also allows you to switch on a
              side-by-side demographic and elections choropleth instead of an overlay.
            </Text>
            <LoopVideoPlayer
              videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_side_by_side.webm`}
            />
          </Flex>
        </ContentSection>
      </Flex>
    </Flex>
  );
}
