import {CTA} from '@/app/components/Static/Content/CTA';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4">
      <LearnSubNav />
      <Box>
        <Heading size="8" as="h1">
          Tutorial
        </Heading>
      </Box>
      <ContentSection title="Getting Started With Districts">
        <Flex direction="column" gapY="4">
          <Text size="3">
            On the Districtr homepage, click “Jump to the Map” in the top right corner. You will
            be redirected to an interactive map of the United States. Click the state for which
            you wish to make a districting plan. All states are available, as well as Washington,
            D.C. and Puerto Rico.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/draw_menu.webm`}
          />
          <Text size="3">
            Once you have selected a state, you will be directed to its landing page. The landing
            page contains all mapping options along with background information. Choose a
            locality (state, region, county, or city) and district type by clicking on a card.
            The available localities and districts vary by state. (Additional localities can be
            added upon request.)
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/select_module.webm`}
          />
          <Text size="3">
            You will now be redirected to your selected districting page. Select the hand icon on
            the toolbar at the bottom of the map, then click and drag to pan across the map. To
            zoom in and out, use the plus and minus buttons in the bottom right corner of the map,
            or use a mouse scroll wheel or trackpad.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/moving_in_map.webm`}
          />
        </Flex>
      </ContentSection>
      <ContentSection title="Drawing Districts">
        <Flex direction="column" gapY="4">
          <Text size="3">
            To draw your first district, select the paintbrush icon on the toolbar at the bottom
            of the map. Click and drag on the map to add units to your district.
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
            To correct the boundaries of your districts, click the erase icon on the toolbar at
            the bottom of the map. Click and drag to remove units from that district. The size of
            the eraser can be adjusted by dragging the slider.
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
          <Text size="3">
            To inspect districts without altering them, or to avoid painting over already-drawn
            areas, toggle the lock icon next to the district number in the list of districts in
            the “Population” tab.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/district_lock.webm`}
          />
          <Text size="3">
            To see which units you still need to color, click the gear icon in the upper right
            corner of the map and choose the “Highlight unassigned areas” box.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/highlight_unassigned.webm`}
          />
        </Flex>
      </ContentSection>

      <ContentSection title="Data Panels">
        <Flex direction="column" gapY="4">
          <Heading as="h3" size="4">
            Demographics
          </Heading>
          <Text size="3">
            Under this tab, you can study the demographic make up of your districts. You have the
            option of total population or voting age population. To change whether this is by
            share or by count, click the gear icon to the right of “Evaluation” and choose
            “Population by Share” or “Population by Count”. You can also view the demographic
            data as a choropleth on the map itself. Choose “Comparison” at the bottom of the
            demographics tab to put the choropleth side by side with the map, or “Overlay” to put
            it on top of the map. Choose a map variable to display.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/demographics_panel.webm`}
          />

          <Heading as="h3" size="4">
            Elections
          </Heading>
          <Text size="3">
            In the elections tab you can view how your districts would have behaved under past
            election data. You can also view the election data as a choropleth on the map itself.
            Choose “Comparison” at the bottom of the elections tab to put the choropleth side by
            side with the map, or “Overlay” to put it on top of the map. Choose a map variable to
            display.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/election_panel.webm`}
          />

          <Heading as="h3" size="4">
            Map Validation
          </Heading>
          <Text size="3">
            Under the map validation tab, you can check whether your map is missing any
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
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/switch_mode.webm`}
          />
          <Text size="3">
            <b>View mode</b> shows your map without any of the editing tools, so you can look at
            or present your plan without the risk of accidentally changing it.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/view_mode.webm`}
          />
          <Text size="3">
            <b>Evaluate mode</b> opens a dashboard summarizing your plan: population balance,
            demographics, and election results by district, all in one place, so you can review
            how your districts stack up without switching between sidebar tabs.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/evaluation_mode.webm`}
          />
        </Flex>
      </ContentSection>

      <ContentSection title="Saving, Sharing, Importing & Exporting">
        <Flex direction="column" gapY="4">
          <Heading as="h3" size="4">
            Saving your Map
          </Heading>
          <Text size="3">
            Your map automatically saves as you work. Clicking the “Save/Status” button in the
            upper right hand corner of the map allows you to save your current map with a map name
            and any comments about the map. Optionally, you can toggle your map from a draft to
            “Ready to Share” if you are fully finished.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/edit_metadata.webm`}
          />
          <Text size="3">
            This allows you to return to your map from the “Manage local maps” page in the upper
            left menu.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/map_catalog.webm`}
          />

          <Heading as="h3" size="4">
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

          <Heading as="h3" size="4">
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

          <Heading as="h3" size="4">
            Exporting Maps
          </Heading>
          <Text size="3">
            Districtr provides the option to export a map in several formats. The most compatible
            format with other platforms is a CSV assignment file which maps Census blocks to
            districts. Click on the Districtr menu in the upper left corner and select “Export
            assignments”, then “Block assignments”. Note that even if you built your map entirely
            out of VTDs, this will create a block assignment file.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/export.webm`}
          />
        </Flex>
      </ContentSection>

      <ContentSection title="Super Draw">
        <Flex direction="column" gapY="4">
          <Text size="3">
            You now know everything you need to draw and share a plan — but if you want to go
            further, <b>Super Draw</b> mode unlocks additional tools for fine-tuning your
            districts. Switch into it from the same “Mode” menu described above.
          </Text>
          <Text size="3">
            If you need to use smaller units of geography to balance the population of your
            districts, click the break icon on the toolbar at the bottom of the map. Then click on
            a unit you want to “shatter”, allowing you to paint subsets of the original unit. You
            can see the population number of each broken piece by clicking the gear icon in the
            upper right corner of the map and selecting “Show total population labels on blocks”.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/shatter.webm`}
          />
          <Text size="3">
            Super Draw also gives you a side-by-side demographic overlay, so you can see how your
            districts are changing in real time as you paint, without leaving the drawing tools.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/super_draw_side_by_side.webm`}
          />
        </Flex>
      </ContentSection>
      <CTA />
    </Flex>
  );
}
