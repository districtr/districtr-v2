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

// Stats' Demographics/Elections text — declared ahead of helpTipContent so
// the stacked layout's combined tips (below) can reuse it instead of
// duplicating it.
const demographicsStatsText = 'See the racial makeup of your districts.';
const electionsStatsText = 'See how your districts would have voted in past elections.';

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
    text: 'Paint by county to roughly balance district populations, then use a smaller brush for more detailed refinement:',
    videoFile: 'draw_tools_combination.webm',
    guideAnchor: 'drawing-the-districts',
    linkSuffix: 'on how to combine tools efficiently',
  },
  // Super Draw's basic tools (pan, paint, erase, county brush, break, inspect)
  // share this one entry, same pattern as drawToolsCombination above.
  superdrawToolsCombination: {
    title: 'Super Draw tools',
    text: 'Once a district is roughly drawn, break units along its border into smaller units to fine-tune its population:',
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
    text: 'Undo or redo your latest changes to the map.',
    videoFile: 'undo_redo.webm',
    guideAnchor: 'drawing-the-districts',
    linkSuffix: 'on how to undo/redo',
  },
  brushSize: {
    title: 'Brush size',
    text: 'Drag to change how many units the brush or eraser covers at once.',
    videoFile: 'brush_size.webm',
    guideAnchor: 'drawing-the-districts',
  },
  countyBrush: {
    title: 'Painting by county',
    text: 'Turn on to paint whole counties at once.',
    videoFile: 'county_brush.webm',
    guideAnchor: 'drawing-the-districts',
  },
  // No video for this one yet — text-only, unlike the other brush tips.
  showPopulationTooltip: {
    title: 'Show population of paintable areas',
    text: "Shows the total population the brush can paint. Locked districts aren't counted, and neither are painted areas when Forbid paint-over is on.",
    guideAnchor: 'drawing-the-districts',
  },
  // No video for this one yet — text-only, unlike the other brush tips.
  disallowPaintOver: {
    title: 'Forbid paint-over',
    text: 'When on, the brush paints only unassigned units and leaves painted areas alone.',
    guideAnchor: 'drawing-the-districts',
  },
  switchDistrict: {
    title: 'Switching districts',
    text: 'Click a color to choose which district to paint. If your plan has many districts, pick one from the dropdown.',
    videoFile: 'drawing_another_district.webm',
    guideAnchor: 'drawing-the-districts',
  },
  sidebarLayoutToggle: {
    title: 'Sidebar layout',
    text: 'Switch the sidebar between tabbed and stacked layouts.',
  },
  visualSettings: {
    title: 'Visual settings',
    text: 'Choose what the map shows.',
    videoFile: 'visual_settings.webm',
    guideAnchor: 'map-layers',
    linkSuffix:
      'on hiding painted districts, showing county lines, or highlighting unassigned areas.',
  },
  districtOverview: {
    title: 'District overview',
    text: 'Track district populations as you draw.',
  },
  districtLock: {
    title: 'Locking districts',
    text: 'Lock a district to keep it from being painted over or erased. Click again to unlock.',
    videoFile: 'lock_district.webm',
    guideAnchor: 'population',
  },
  districtPin: {
    title: 'Pinning districts',
    text: 'Pin: the district tables show only pinned districts until you unpin them or choose Show all.',
  },
  idealPopulation: {
    title: 'Ideal population',
    text: 'Ideal population is the total population divided by the number of districts. Each district should be as close to it as possible so everyone is represented equally.',
    guideAnchor: 'population',
  },
  topToBottomDeviation: {
    title: 'Top-to-bottom deviation',
    text: 'Top-to-bottom deviation is the population difference between the most and least populated districts.',
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
  // tabs' content into one section, and keeps the original panel clip (which
  // shows both halves together) rather than either tab's own split-out clip.
  // Text is still shared with demographicsStats, since that description
  // holds regardless.
  demographics: {
    title: 'Demographics',
    text: demographicsStatsText,
    videoFile: 'demographics_panel.webm',
    // Covers both the Map Layers and Stats tabs' content at once here, so
    // neither sub-anchor alone represents it — points at the section itself.
    guideAnchor: 'data-tabs',
  },
  // Map Layers' Demographics section is a live list of map-display toggles —
  // self-explanatory, but worth a demonstration link.
  demographicsMapLayer: {
    title: 'Demographics',
    text: '',
    videoFile: 'demographics_display.webm',
    guideAnchor: 'map-layers',
  },
  demographicsStats: {
    title: 'Demographics',
    text: demographicsStatsText,
  },
  elections: {
    title: 'Elections',
    text: electionsStatsText,
    videoFile: 'election_panel.webm',
    guideAnchor: 'data-tabs',
  },
  electionsMapLayer: {
    title: 'Elections',
    text: '',
    videoFile: 'election_display.webm',
    guideAnchor: 'map-layers',
  },
  electionsStats: {
    title: 'Elections',
    text: electionsStatsText,
  },
  mapValidation: {
    title: 'Validity check',
    text: 'Check whether any areas are still unassigned and whether each district is one connected piece.',
    videoFiles: ['completeness_check.webm', 'contiguity_check.webm'],
    guideAnchor: 'stats',
  },
  boundariesAndAreas: {
    title: 'Boundaries and areas',
    text: 'Show reference layers on the map, such as existing political boundaries.',
  },
  // Text-only on purpose (no videoFile): this renders inside the Mode switcher's
  // DropdownMenu.Item, whose own pointer handling closes the hover card before the
  // cursor can reach an interactive link inside it. Without a video there's no
  // link, so nothing ever needs to travel into the card.
  superDraw: {
    title: 'Super Draw',
    text: 'Super Draw adds tools for fine-tuning districts, including the break tool and demographic or election data shown beside your map.',
    guideAnchor: 'super-draw',
  },
  editMapDetails: {
    title: 'Edit map names and details',
    text: 'Rename your map, add a description, or update its status.',
    videoFile: 'edit_metadata.webm',
    guideAnchor: 'edit-map-names-and-details',
  },
  mapActions: {
    title: 'Map actions',
    text: 'Share a link to your map, export it (CSV, GeoJSON, Shapefile, or JSON), or change district colors.',
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
  freedomToVoteTest: {
    title: 'Freedom-to-Vote test',
    text: 'Tests whether each party\'s share of seats stays close to its share of votes (within 7% or one seat, whichever is larger) in the two most recent Presidential and two most recent Senate elections. Proposed in the Freedom to Vote Act (S.2747, 2021). See Duchin & Schoenbach, "Redistricting for Proportionality" (2022).',
  },
  saveStatus: {
    title: 'Autosave',
    text: 'Autosave is on. Changes save 30 seconds after your last edit.',
  },
  mapAccessStatus: {
    title: 'Map access',
    text: 'Shows who can currently edit this map.',
  },
} satisfies Record<string, HelpTipEntry>;

export type HelpTipKey = keyof typeof helpTipContent;
