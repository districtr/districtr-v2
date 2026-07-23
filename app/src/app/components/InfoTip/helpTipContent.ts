export interface HelpTipEntry {
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
    text: 'Select the hand icon, then click and drag to pan across the map. Use the plus/minus buttons, or your mouse scroll wheel or trackpad, to zoom in and out.',
    videoFile: 'moving_in_map.webm',
    guideAnchor: 'moving-across-the-map',
  },
  paint: {
    text: 'Select the paintbrush icon, then click and drag on the map to add units to your district.',
    videoFile: 'drawing_on_map.webm',
    guideAnchor: 'drawing-the-districts',
  },
  erase: {
    text: 'Select the eraser icon, then click and drag to remove units from a district. Adjust the eraser size with the slider.',
    videoFile: 'eraser.webm',
    guideAnchor: 'drawing-the-districts',
  },
  break: {
    text: 'Click a unit to "break" it into smaller pieces, so you can paint subsets of it — useful for fine-tuning population balance. Only available in Super Draw mode.',
    videoFile: 'shatter.webm',
    guideAnchor: 'super-draw',
  },
  undoRedo: {
    text: 'Click the undo/redo buttons to revert or reapply changes to your district plan.',
    videoFile: 'undo_redo.webm',
    guideAnchor: 'drawing-the-districts',
  },
  brushSize: {
    text: 'Drag this slider to change how many units the paintbrush or eraser affects at once.',
    videoFile: 'brush_size.webm',
    guideAnchor: 'drawing-the-districts',
  },
  countyBrush: {
    text: 'Toggle this to paint whole counties at once instead of individual units.',
    videoFile: 'county_brush.webm',
    guideAnchor: 'drawing-the-districts',
  },
  switchDistrict: {
    text: 'Click a color to switch which district you’re painting. For plans with many districts, use the dropdown to find the one you want.',
    videoFile: 'drawing_another_district.webm',
    guideAnchor: 'drawing-the-districts',
  },
  visualSettings: {
    text: 'Control what the map shows: hide painted districts, toggle county boundaries, or highlight unassigned areas that still need a district.',
    videoFile: 'visual_settings.webm',
    guideAnchor: 'visual-settings',
  },
  districtOverview: {
    text: 'Lists each drawn district — click a number to select it and switch the brush to that color. Also shows each district’s population against the ideal target.',
    videoFile: 'district_overview.webm',
    guideAnchor: 'district-overview',
  },
  districtLock: {
    text: 'Toggle the lock icon next to a district to protect it from being painted over while you work on other districts.',
    videoFile: 'district_lock.webm',
    guideAnchor: 'district-overview',
  },
  demographics: {
    text: 'View the demographic makeup of your districts by total population or voting age population, as a map overlay or as sized circles.',
    videoFile: 'demographics_panel.webm',
    guideAnchor: 'demographics',
  },
  elections: {
    text: 'See how your districts would have behaved under past election results, as a map overlay or as sized circles.',
    videoFile: 'election_panel.webm',
    guideAnchor: 'elections',
  },
  mapValidation: {
    text: 'Check whether your map is missing any geographic units, and whether each district forms a single, connected shape.',
    videoFiles: ['completeness_check.webm', 'contiguity_check.webm'],
    guideAnchor: 'map-validation',
  },
  superDraw: {
    text: 'Super Draw unlocks additional tools for fine-tuning your districts, including the break tool and a side-by-side view of demographic or election data next to your map.',
    videoFile: 'super_draw_side_by_side.webm',
    guideAnchor: 'super-draw',
  },
} satisfies Record<string, HelpTipEntry>;

export type HelpTipKey = keyof typeof helpTipContent;
