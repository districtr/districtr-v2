import {CTA} from '@/app/components/Static/Content/CTA';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';

export default function GuidePage() {
  return (
    <Flex className="w-full mx-auto max-w-screen-lg" direction="column" gapY="4">
      <Box>
        <Heading size="8" as="h1">
          Tutorial
        </Heading>
      </Box>
      <ContentSection title="Getting Started With Districts">
        <Flex direction="column" gapY="4">
          <Text size="3">
            On the Districtr homepage, click “Jump to the Map” in the top right corner.
          </Text>
          <Text size="3">
            You will be redirected to an interactive map of the United States. Click the state for
            which you wish to make a districting plan. All states are available, as well as
            Washington, D.C. and Puerto Rico.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/get_to_map.webm`}
          />
          <Text size="3">
            Once you have selected a state, you will be directed to its landing page. The landing
            page contains all mapping options along with background information.
          </Text>
          <Text size="3">
            Choose a locality (state, region, county, or city) and district type by clicking on a
            card. The available localities and districts vary by state. (Additional localities can
            be added upon request.)
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/get_to_locality_module.webm`}
          />
          <Text size="3">You will now be redirected to your selected districting page.</Text>
        </Flex>
      </ContentSection>
      <ContentSection title="Main Tools">
        <Flex direction="column" gapY="4">
          <Heading as="h3" size="4">
            Moving across the map
          </Heading>

          <Text size="3">
            Select the hand icon on the toolbar at the bottom of the map. Then click and drag to pan
            across the map.
          </Text>
          <Text size="3">
            o zoom in and out, use the plus and minus buttons in the bottom right corner of the map.
            You can also use a mouse scroll wheel or trackpad.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/move_zoom.webm`}
          />

          <Heading as="h3" size="4">
            Drawing the districts
          </Heading>

          <Text size="3">
            To draw your first district, select the paintbrush icon on the toolbar at the bottom of
            the map. Click and drag on the map to add units to your district.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/paint_1.webm`}
          />
          <Text size="3">
            To draw another district, select a new color from the color bar that appears when you
            click the paint icon. Each color corresponds to a different district. For pages with
            large numbers of districts, only one color will show when you start. For these, use the
            dropdown menu to select a different color.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/paint_2.webm`}
          />
          <Text size="3">
            To change the size of the brush, drag the brush size slider directly above the color
            bar.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/brush_size.webm`}
          />
          <Text size="3">
            To paint whole counties, toggle the “Paint counties” box next to the slider.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/paint_by_county.webm`}
          />
          <Text size="3">
            To inspect districts without altering them, or to avoid painting over already-drawn
            areas, toggle the lock icon next to the district number in the list of districts in the
            “Population” tab
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/lock_districts.webm`}
          />
          <Text size="3">
            To correct the boundaries of your districts, click the erase icon on the toolbar at the
            bottom of the map. Click and drag to remove units from that district. The size of the
            eraser can be adjusted by dragging the slider.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/erase.webm`}
          />
          <Text size="3">
            Alternately, click the “undo/redo” buttons to revert the boundaries of your district
            plan to a previous version.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/undo_redo.webm`}
          />
          <Text size="3">
            If you need to use smaller units of geography to balance the population of your
            districts, click the break icon on the toolbar at the bottom of the map. Then click on a
            unit you want to “shatter”, allowing you to paint subsets of the original unit. You can
            see the population number of each broken piece by clicking the gear icon in the upper
            right corner of the map and selecting “Show total population labels on blocks”.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/shatter.webm`}
          />
          <Text size="3">
            If you need to move the toolbar, you can do so by clicking the gear icon in the upper
            right corner of the map and selecting “Enable draggable toolbar”. Beneath that option,
            you can also choose to resize the toolbar. Once enabled, you can drag the toolbar around
            the map or snap it to the right hand panel.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/draggable_toolbar.webm`}
          />
          <Heading as="h3" size="4">
            Districts
          </Heading>
          <Text size="3">
            To hide the districts from the map, click the gear icon in the upper right corner of the
            map and toggle the “Show painted districts” box.
          </Text>
          <Text size="3">
            To see county boundaries overlaid on your map, toggle the “Show County Boundaries” box.
          </Text>
        </Flex>
      </ContentSection>

      <ContentSection title="Tabs">
        <Flex direction="column" gapY="4">
          <Heading as="h3" size="4">
            Population
          </Heading>

          <Text size="3">
            The population tab allows you to view the population of each drawn district. To balance
            your population evenly between districts, make reference to the ideal population count
            and vertical bar provided in this tab.
          </Text>
          <Text size="3">
            To see which units you still need to color, click the gear icon in the upper right
            corner of the map and then choose the “Highlight unassigned areas” box.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/highlight_unassigned.webm`}
          />

          <Heading as="h3" size="4">
            Demographics
          </Heading>
          <Text size="3">
            Under this tab, you can study the demographic make up of your districts. You have the
            option of total population or voting age population. To change whether this is by share
            or by count, click the gear icon to the right of “Evaluation” and choose “Population by
            Share” or “Population by Count”.
          </Text>
          <Text size="3">
            You can also view the demographic data as a choropleth on the map itself. Choose
            “Comparison” at the bottom of the demographics tab to put the choropleth side by side
            with the map, or “Overlay” to put it on top of the map. Choose a map variable to
            display.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/demographic.webm`}
          />

          <Heading as="h3" size="4">
            Elections
          </Heading>

          <Text size="3">
            In the elections tab you can view how your districts would have behaved under past
            election data. You can also view the election data as a choropleth on the map itself.
            Choose “Comparison” at the bottom of the demographics tab to put the choropleth side by
            side with the map, or “Overlay” to put it on top of the map. Choose a map variable to
            display.
          </Text>

          <Text size="3">
            You can also view the election data as a choropleth on the map itself. Choose
            “Comparison” at the bottom of the demographics tab to put the choropleth side by side
            with the map, or “Overlay” to put it on top of the map. Choose a map variable to
            display.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/election.webm`}
          />

          <Heading as="h3" size="4">
            Map Validation
          </Heading>

          <Text size="3">
            Under the map validation tab, you can check that your map is missing any geographic
            units, and check if the districts are contiguous.
          </Text>

          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/zoom_unassigned.webm`}
          />
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/contiguity.webm`}
          />
        </Flex>
      </ContentSection>
      <ContentSection title="Saving and Sharing">
        <Flex direction="column" gapY="4">
          <Heading as="h3" size="4">
            Saving your Map
          </Heading>
          <Text size="3">Your map automatically saves as you work.</Text>
          <Text size="3">
            Clicking the “Status” button in the upper right hand corner of the map allows you to
            save your current map with a map name and any comments about the map.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/save_map.webm`}
          />
          <Text size="3">
            {' '}
            This allows you to return to your map from the “Recent Maps” tab in the upper left hand
            drop down menu.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/recent_maps.webm`}
          />
          <Text size="3">
            Optionally, you can toggle your map from a draft to “Ready to Share” if you are fully
            finished.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/ready_to_share.webm`}
          />

          <Heading as="h3" size="4">
            Sharing your Map
          </Heading>

          <Text size="3">
            Clicking the “Share” button saves the map you created and allows you to share a link to
            the map. You can either share a frozen link, which does not allow editing of the
            original map, or an editable link, which only allows people with a password to edit.
          </Text>
          <LoopVideoPlayer
            videoUrl={`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/share_map.webm`}
          />
        </Flex>
      </ContentSection>
      <CTA />
    </Flex>
  );
}
