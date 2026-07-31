export interface HelpTipEntry {
  /** Short heading shown at the top of the expanded video modal. */
  title: string;
  text: string;
  /** Single clip. Use `videoFiles` instead for an entry covering more than one clip. */
  videoFile?: string;
  /** Multiple clips, shown one after another when expanded (e.g. two related checks). */
  videoFiles?: string[];
  guideAnchor?: string;
  /** Overrides the default "Quick demonstration ▸" link label — for an entry
   * whose hover card is the link itself (no separate description above it). */
  linkText?: string;
}

// Not annotated as `Record<string, HelpTipEntry>` on purpose: that annotation would widen
// `keyof typeof helpTipContent` to `string | number`, defeating HelpTipKey as a literal-key
// safety net for callers (e.g. the `helpKey` field on toolbar tool configs).
export const helpTipContent = {
  // Draw mode's three tools (pan, paint, erase) share this one entry: each
  // tool button renders its own HelpTip instance (like undoRedo below) but
  // passes text="" to suppress this entry's `text` in the hover card, leaving
  // only the linkText link — so title/videoFile/text still need to exist here
  // even though the hover card itself never shows `text` (the video modal's
  // description still does).
  drawToolsCombination: {
    title: 'Draw tools',
    text: 'Pan, paint, and erase are the tools you use to draw your districts.',
    videoFile: 'draw_tools_combination.webm',
    guideAnchor: 'drawing-the-districts',
    linkText: 'Quick demonstration on how to combine tools efficiently ▸',
  },
  // Super Draw's five tools (pan, paint, erase, break, inspect) share this one
  // entry, same pattern as drawToolsCombination above.
  superdrawToolsCombination: {
    title: 'Super Draw tools',
    text: 'Pan, paint, erase, break, and inspect are the tools available in Super Draw.',
    videoFile: 'superdraw_tools_combination.webm',
    guideAnchor: 'super-draw',
    linkText: 'Quick demonstration on how to combine tools efficiently ▸',
  },
  // Same text-suppression pattern as the combos above: ToolButtons.tsx passes
  // text="" in plain Draw mode, so only the linkText link shows; Super Draw
  // mode passes the chorded shortcuts as an override instead (no video link
  // in that mode — no room for both, and the shortcuts matter more there).
  undoRedo: {
    title: 'Undo & redo',
    text: 'Click the undo/redo buttons to revert or reapply changes to your district plan.',
    videoFile: 'undo_redo.webm',
    guideAnchor: 'drawing-the-districts',
    linkText: 'Quick demonstration on how to undo/redo ▸',
  },
  brushSize: {
    title: 'Brush size',
    text: 'Drag this slider to change how many units the paintbrush or eraser affects at once.',
    videoFile: 'brush_size.webm',
    guideAnchor: 'drawing-the-districts',
  },
  countyBrush: {
    title: 'Painting by county',
    text: 'Toggle this to paint whole counties at once instead of individual units.',
    videoFile: 'county_brush.webm',
    guideAnchor: 'drawing-the-districts',
  },
  switchDistrict: {
    title: 'Switching districts',
    text: 'Click a color to switch which district you’re painting. For plans with many districts, use the dropdown to find the one you want.',
    videoFile: 'drawing_another_district.webm',
    guideAnchor: 'drawing-the-districts',
  },
  sidebarLayoutToggle: {
    title: 'Sidebar layout',
    text: 'Switch the sidebar between the tabbed layout (Population, Stats, and Map Layers) and the classic stacked panels.',
  },
  visualSettings: {
    title: 'Visual settings',
    text: 'Click "Visual settings" above to control what the map shows: hide painted districts, toggle county boundaries, or highlight unassigned areas that still need a district.',
    videoFile: 'visual_settings.webm',
    guideAnchor: 'visual-settings',
  },
  districtOverview: {
    title: 'District overview',
    text: 'Click here to expand the district overview, listing each drawn district — click a number there to select it and switch the brush to that color, and see each district’s population against the ideal target.',
    videoFile: 'district_overview.webm',
    guideAnchor: 'district-overview',
  },
  districtLock: {
    title: 'Locking districts',
    text: 'Toggle the lock icon next to a district to protect it from being painted over while you work on other districts.',
    videoFile: 'district_lock.webm',
    guideAnchor: 'district-overview',
  },
  idealPopulation: {
    title: 'Ideal population',
    text: 'The ideal population is the total population divided by the number of districts. Each district should be as close to this number as possible so everyone has equal representation.',
    guideAnchor: 'district-overview',
  },
  topToBottomDeviation: {
    title: 'Top-to-bottom deviation',
    text: 'The top-to-bottom deviation is the difference in population between the largest and smallest districts.',
  },
  barScaling: {
    title: 'Bar scaling',
    text: 'Scale population bars based on the current zone population range to work on detailed population balancing. By default, bars show from zero to the ideal population.',
  },
  maxDeviation: {
    title: 'Maximum deviation',
    text: 'The maximum deviation is the largest deviation from the ideal population. You can use either a percentage of the ideal population, or a fixed number of people.',
  },
  demographics: {
    title: 'Demographics',
    text: 'Click here to expand demographics and view the makeup of your districts by total population or voting age population, as a map overlay or as sized circles.',
    videoFile: 'demographics_panel.webm',
    guideAnchor: 'demographics',
  },
  elections: {
    title: 'Elections',
    text: 'Click here to expand elections and see how your districts would have behaved under past election results, as a map overlay or as sized circles.',
    videoFile: 'election_panel.webm',
    guideAnchor: 'elections',
  },
  mapValidation: {
    title: 'Validity check',
    text: 'Click here to expand the validity check and see whether your map is missing any geographic units, and whether each district forms a single, connected shape.',
    videoFiles: ['completeness_check.webm', 'contiguity_check.webm'],
    guideAnchor: 'map-validation',
  },
  boundariesAndAreas: {
    title: 'Boundaries and areas',
    text: 'Click here to see optional toggles for reference overlays relevant to redistricting, such as existing political boundaries.',
  },
  // Text-only on purpose (no videoFile): this renders inside the Mode switcher's
  // DropdownMenu.Item, whose own pointer handling closes the hover card before the
  // cursor can reach an interactive link inside it. Without a video there's no
  // link, so nothing ever needs to travel into the card.
  superDraw: {
    title: 'Super Draw',
    text: 'Super Draw unlocks additional tools for fine-tuning your districts, including the break tool and a side-by-side view of demographic or election data next to your map.',
    guideAnchor: 'super-draw',
  },
  editMapDetails: {
    title: 'Edit map names and details',
    text: 'Click here to rename your map, add a description, or update its draft status.',
    videoFile: 'edit_metadata.webm',
    guideAnchor: 'edit-map-names-and-details',
  },
  mapActions: {
    title: 'Map actions',
    text: 'Click "Map actions" above to share a link to your map, or export it as a CSV of unit assignments, a GeoJSON or Shapefile of district boundaries, or a JSON of evaluation metrics.',
    videoFiles: ['share_map.webm', 'export.webm'],
    guideAnchor: 'saving-sharing-importing-and-exporting',
  },
  modeSwitcher: {
    title: 'Switching modes',
    text: 'Click the mode switcher above to move between Draw (build your plan), View (a clean read-only display), and Evaluate (a dashboard of stats about it).',
    videoFiles: ['view_mode.webm', 'evaluation_mode.webm'],
    guideAnchor: 'map-modes',
  },
  // No video for either of these — they're live status indicators, not features to
  // demo, so `text` is always supplied via HelpTip's override prop instead of this
  // fallback (kept only so the entry satisfies HelpTipEntry's required `text`).
  saveStatus: {
    title: 'Autosave',
    text: 'Autosave is on: changes save automatically after 30 seconds of inactivity.',
  },
  mapAccessStatus: {
    title: 'Map access',
    text: 'Shows who can currently edit this map.',
  },
} satisfies Record<string, HelpTipEntry>;

export type HelpTipKey = keyof typeof helpTipContent;
