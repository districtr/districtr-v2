export interface HelpTipEntry {
  /** Short heading shown at the top of the expanded video modal. */
  title: string;
  text: string;
  /** Single clip. Use `videoFiles` instead for an entry covering more than one clip. */
  videoFile?: string;
  /** Multiple clips, shown one after another when expanded (e.g. two related checks). */
  videoFiles?: string[];
  guideAnchor?: string;
}

// Not annotated as `Record<string, HelpTipEntry>` on purpose: that annotation would widen
// `keyof typeof helpTipContent` to `string | number`, defeating HelpTipKey as a literal-key
// safety net for callers (e.g. the `helpKey` field on toolbar tool configs).
export const helpTipContent = {
  pan: {
    title: 'Moving around the map',
    text: 'Select the hand icon, then click and drag to pan across the map. Use the plus/minus buttons, or your mouse scroll wheel or trackpad, to zoom in and out.',
    videoFile: 'moving_in_map.webm',
    guideAnchor: 'moving-across-the-map',
  },
  paint: {
    title: 'Drawing districts',
    text: 'Select the paintbrush icon, then click and drag on the map to add units to your district.',
    videoFile: 'drawing_on_map.webm',
    guideAnchor: 'drawing-the-districts',
  },
  erase: {
    title: 'Erasing',
    text: 'Select the eraser icon, then click and drag to remove units from a district. Adjust the eraser size with the slider.',
    videoFile: 'eraser.webm',
    guideAnchor: 'drawing-the-districts',
  },
  break: {
    title: 'Breaking a unit into blocks',
    text: 'Click a unit to "break" it into smaller pieces, so you can paint subsets of it — useful for fine-tuning population balance. Only available in Super Draw mode.',
    videoFile: 'shatter.webm',
    guideAnchor: 'super-draw',
  },
  undoRedo: {
    title: 'Undo & redo',
    text: 'Click the undo/redo buttons to revert or reapply changes to your district plan.',
    videoFile: 'undo_redo.webm',
    guideAnchor: 'drawing-the-districts',
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
  visualSettings: {
    title: 'Visual settings',
    text: 'Control what the map shows: hide painted districts, toggle county boundaries, or highlight unassigned areas that still need a district.',
    videoFile: 'visual_settings.webm',
    guideAnchor: 'visual-settings',
  },
  districtOverview: {
    title: 'District overview',
    text: 'Lists each drawn district — click a number to select it and switch the brush to that color. Also shows each district’s population against the ideal target.',
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
    text: 'View the demographic makeup of your districts by total population or voting age population, as a map overlay or as sized circles.',
    videoFile: 'demographics_panel.webm',
    guideAnchor: 'demographics',
  },
  elections: {
    title: 'Elections',
    text: 'See how your districts would have behaved under past election results, as a map overlay or as sized circles.',
    videoFile: 'election_panel.webm',
    guideAnchor: 'elections',
  },
  mapValidation: {
    title: 'Validity check',
    text: 'Check whether your map is missing any geographic units, and whether each district forms a single, connected shape.',
    videoFiles: ['completeness_check.webm', 'contiguity_check.webm'],
    guideAnchor: 'map-validation',
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
    text: 'Share a link to your map, or export it as a CSV of unit assignments, a GeoJSON or Shapefile of district boundaries, or a JSON of evaluation metrics.',
    videoFiles: ['share_map.webm', 'export.webm'],
    guideAnchor: 'saving-sharing-importing-and-exporting',
  },
  modeSwitcher: {
    title: 'Switching modes',
    text: 'Move between Draw (build your plan), View (a clean read-only display), and Evaluate (a dashboard of stats about it).',
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
