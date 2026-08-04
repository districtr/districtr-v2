export interface HelpTipEntry {
  /** Short heading shown at the top of the expanded video modal. */
  title: string;
  text: string;
  /** Single clip. Use `videoFiles` instead for an entry covering more than one clip. */
  videoFile?: string;
  /** Multiple clips, shown one after another when expanded (e.g. two related checks). */
  videoFiles?: string[];
  guideAnchor?: string;
  /** Plain (non-clickable) text trailing after the "Quick demonstration ▸" link,
   * on the same line — e.g. "Quick demonstration ▸ on how to undo/redo". The
   * link label itself and its arrow stay fixed; this only adds context after. */
  linkSuffix?: string;
}

// Map Layers' Demographics/Elections sections are live lists of map-display
// toggles — self-explanatory, but worth a demonstration link. Declared ahead
// of helpTipContent so the stacked layout's combined tips (below) can compose
// from these instead of duplicating videoFile/guideAnchor in a second literal.
const demographicsMapLayerTip = {
  title: 'Demographics',
  text: '',
  videoFile: 'demographics_panel.webm',
  guideAnchor: 'demographics',
};
const electionsMapLayerTip = {
  title: 'Elections',
  text: '',
  videoFile: 'election_panel.webm',
  guideAnchor: 'elections',
};
// Stats' Demographics/Elections sections are data tables — worth explaining
// what they show, but with nothing to demonstrate.
const demographicsStatsTip = {
  title: 'Demographics',
  text: 'Click here to view the racial makeup of your districts.',
};
const electionsStatsTip = {
  title: 'Elections',
  text: 'Click here to view how your districts would have performed in past elections.',
};

// Not annotated as `Record<string, HelpTipEntry>` on purpose: that annotation would widen
// `keyof typeof helpTipContent` to `string | number`, defeating HelpTipKey as a literal-key
// safety net for callers (e.g. the `helpKey` field on toolbar tool configs).
export const helpTipContent = {
  // Draw mode's basic tools (pan, paint, erase, county brush) share this one
  // entry: each button/toggle renders its own HelpTip instance (like undoRedo
  // below) but passes text="" to suppress this entry's `text` in the hover
  // card, leaving only the demonstration link — so title/videoFile/text still
  // need to exist here even though the hover card itself never shows `text`
  // (the video modal's description still does).
  drawToolsCombination: {
    title: 'Draw tools',
    text: 'Use Paint by county to paint the basic outline, and use smaller brushes/erasers to refine the edges:',
    videoFile: 'draw_tools_combination.webm',
    guideAnchor: 'drawing-the-districts',
    linkSuffix: 'on how to combine tools efficiently',
  },
  // Super Draw's basic tools (pan, paint, erase, county brush, break, inspect)
  // share this one entry, same pattern as drawToolsCombination above.
  superdrawToolsCombination: {
    title: 'Super Draw tools',
    text: 'After drawing a district in approximation, break units on the edge into smaller units to fine-tune a district’s population balance:',
    videoFile: 'superdraw_tools_combination.webm',
    guideAnchor: 'super-draw',
    linkSuffix: 'on how to combine tools efficiently',
  },
  // Same text-suppression pattern as the combos above in plain Draw mode
  // (ToolButtons.tsx passes text=""). Super Draw mode passes the chorded
  // shortcuts as an override instead — that override supplements this entry's
  // own video rather than describing a different situation, so the link still
  // shows alongside it (see HelpTip's `hideLink`).
  undoRedo: {
    title: 'Undo & redo',
    text: 'Click the undo/redo buttons to revert or reapply changes to your district plan.',
    videoFile: 'undo_redo.webm',
    guideAnchor: 'drawing-the-districts',
    linkSuffix: 'on how to undo/redo',
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
  // No video for this one yet — text-only, unlike the other brush tips.
  disallowPaintOver: {
    title: 'Disallow paint over',
    text: 'When enabled, the brush will only add unassigned units, leaving painted areas untouched.',
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
    text: 'Switch the sidebar between the tabbed and the stacked layouts.',
  },
  visualSettings: {
    title: 'Visual settings',
    text: 'Click to see a list of controls for what the map shows',
    videoFile: 'visual_settings.webm',
    guideAnchor: 'visual-settings',
    linkSuffix:
      'on how to hide painted districts, toggle county boundaries, or highlight unassigned areas that still need a district.',
  },
  districtOverview: {
    title: 'District overview',
    text: 'Expand here to monitor the district populations as you draw.',
  },
  districtLock: {
    title: 'Locking districts',
    text: 'Toggle it to protect this district from being painted over or erased.',
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
  // Stacked layout's Demographics accordion combines the Map Layers and Stats
  // tabs' content into one section, so its tip carries both the text and the
  // demonstration link those two tabs otherwise split between them below —
  // composed from those two tips rather than duplicating either.
  demographics: {
    ...demographicsMapLayerTip,
    text: demographicsStatsTip.text,
  },
  demographicsMapLayer: demographicsMapLayerTip,
  demographicsStats: demographicsStatsTip,
  elections: {
    ...electionsMapLayerTip,
    text: electionsStatsTip.text,
  },
  electionsMapLayer: electionsMapLayerTip,
  electionsStats: electionsStatsTip,
  mapValidation: {
    title: 'Validity check',
    text: 'Click here to see whether your map is missing any geographic units, and whether each district forms a single, connected shape.',
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
    text: 'Share a link to your map, or export it as a CSV, GeoJSON, Shapefile, or JSON.',
    videoFiles: ['share_map.webm', 'export.webm'],
    guideAnchor: 'saving-sharing-importing-and-exporting',
  },
  modeSwitcher: {
    title: 'Switching modes',
    text: 'Switch between Draw, View, and Evaluate modes.',
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
