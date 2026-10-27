/**
 * Every word the ensemble modal shows, in one place: the modal is the only
 * explanation readers get of where these plans come from, and it is edited far
 * more often than the components around it.
 *
 * `{plans}` and `{preset}` are substituted with the ensemble's plan count and
 * the selected preset's label by `fillEnsembleText`.
 */
export const ENSEMBLE_MODAL_TEXT = {
  title: 'About these plans',
  subtitle:
    'Your plan is compared against {plans} plans drawn by a computer for the same map, using the {preset} recipe.',

  methodologyHeading: 'How the plans are made',
  methodologyParagraphs: [
    'The comparison plans come from a Markov chain: a process that starts from one valid districting plan and changes it a little at a time. Each change merges two neighbouring districts, draws a random spanning tree over the merged region, and cuts one edge of that tree to split the region back into two districts of near-equal population. The result is a new plan, and the process repeats.',
    'Every accepted change produces one plan, and that plan is a step of the chain. Consecutive steps differ in two districts only, so neighbouring steps look alike while steps far apart look quite different. The whole run of {plans} steps is the ensemble: a sample of the plans this recipe tends to produce for this state, under equal population and contiguity, with partisan outcomes left out of the recipe.',
    'That is what makes the ensemble a yardstick. A metric value that is ordinary among these plans is one the geography and the rules produce on their own; a value far out in the tail is one that the recipe rarely reaches.',
  ],
  methodologyReferences: [
    {
      text: 'GerryChain documentation — the reference implementation of this method',
      href: 'https://gerrychain.readthedocs.io/',
    },
    {
      text: 'Cannon, Duchin, Randall and Rule (2025), Spanning Trees and Redistricting — the recipes these ensembles follow',
      href: null,
    },
  ],

  demonstrationHeading: 'A hundred consecutive steps',
  demonstrationIntro:
    'These are steps {first} to {last} of the chain, in order, with the metrics of each one. Move the slider, or let it run, to watch how a single merge-and-split changes the map and its scores. Select any score to chart it below.',
  thumbnailAlt: 'Districts of step {step}',
  animateLabel: 'Animate',
  pauseLabel: 'Pause',
  stepForwardLabel: '+1 step',
  stepLabel: 'Step {step}',

  partisanTableHeading: 'Election results and partisanship',
  otherTableHeading: 'Competitiveness, splits and compactness',
  typeColumn: 'Type',
  scoreColumn: 'Score',
  valueColumn: 'Value',

  histogramHeading: 'Where the evaluated plan sits',
  histogramIntro:
    'Pick a metric here, or click any value in the tables above, to see where the evaluated plan sits. Each bar is the percent of the {plans} ensemble plans whose score falls in that range.',
  thisPlanMarker: 'Evaluated plan',
  axisLabel: 'Percent of plans',

  extremesCaption:
    'Dotted lines mark plans a search found by pursuing one goal at a time under the {preset} recipe’s rules. They lie outside the {plans} sampled plans: they show what the rules allow, while the bars show what random drawing typically gives.',
  extremesToggle: 'Show all {count} searches',
  extremeValue: 'This plan’s {metric}: {value}',
  extremeThumbAlt: 'Districts of the plan found for “{label}”',

  jointHeading: 'Two metrics at once',
  jointIntro:
    'Each cell holds the share of the {plans} plans drawn by the {preset} recipe whose two scores fall in that cell; darker cells hold more plans.',
  jointPairLabel: 'Pair of metrics',
  jointPairOption: '{x} and {y}',
  jointAxisElection: '{label} ({election})',
  jointHover: '{x}: {xRange} · {y}: {yRange} · {share} of plans',
  jointLegendFew: 'Fewer plans',
  jointLegendMany: 'More plans (up to {share} per cell)',
  jointLoading: 'Loading the pair…',

  sliceSentence:
    'Among the {plans} plans drawn by the {preset} recipe, {group} {measure}, {comparison}.',
  sliceTenth: 'the tenth',
  sliceShare: 'the {share} of plans',
  sliceElection: ' in the {election} results',
  sliceSame: 'the same as the rest',
  sliceMore: '{delta} more than the rest',
  sliceFewer: '{delta} fewer than the rest',
  sliceHigher: '{delta} higher than the rest',
  sliceLower: '{delta} lower than the rest',
  slicePoints: '{delta} percentage points',
  /** How the sentence names the plans that score best on the X series. */
  sliceGroups: {
    seats: 'with the most Democratic seats',
    disproportionality: 'closest to proportional',
    efficiency_gap: 'with the efficiency gap closest to zero',
    mean_median: 'with the mean-median score closest to zero',
    partisan_bias: 'with the partisan bias closest to zero',
    eguia: 'with Eguia’s metric closest to zero',
    n_dem_districts: 'with the most Democratic sweep districts',
    n_rep_districts: 'with the most Republican sweep districts',
    n_swing_districts: 'with the most swing districts',
    n_competitive_contests: 'with the most competitive contests',
    county_splits: 'with the fewest split counties',
    county_pieces: 'with the fewest county pieces',
    cut_edges: 'with the fewest cut edges',
    polsby_popper_mean: 'with the highest mean Polsby-Popper score',
    polsby_popper_min: 'with the highest lowest-district Polsby-Popper score',
    polsby_popper_max: 'with the highest highest-district Polsby-Popper score',
    reock_mean: 'with the highest mean Reock score',
    reock_min: 'with the highest lowest-district Reock score',
    reock_max: 'with the highest highest-district Reock score',
  } as Record<string, string>,
  /** How the sentence states a group's median on the Y series. */
  sliceMeasures: {
    seats: 'win a median of {value} Democratic seats',
    disproportionality: 'have a median disproportionality of {value}',
    efficiency_gap: 'have a median efficiency gap of {value}',
    mean_median: 'have a median mean-median score of {value}',
    partisan_bias: 'have a median partisan bias of {value}',
    eguia: 'have a median Eguia’s metric of {value}',
    n_dem_districts: 'have a median of {value} Democratic sweep districts',
    n_rep_districts: 'have a median of {value} Republican sweep districts',
    n_swing_districts: 'have a median of {value} swing districts',
    n_competitive_contests: 'have a median of {value} competitive contests',
    county_splits: 'split a median of {value} counties',
    county_pieces: 'have a median of {value} county pieces',
    cut_edges: 'have a median of {value} cut edges',
    polsby_popper_mean: 'have a median mean Polsby-Popper score of {value}',
    polsby_popper_min: 'have a median lowest-district Polsby-Popper score of {value}',
    polsby_popper_max: 'have a median highest-district Polsby-Popper score of {value}',
    reock_mean: 'have a median mean Reock score of {value}',
    reock_min: 'have a median lowest-district Reock score of {value}',
    reock_max: 'have a median highest-district Reock score of {value}',
  } as Record<string, string>,

  loading: 'Loading the demonstration plans…',
  loadFailed:
    'The demonstration plans are unavailable right now. The rest of this page still works.',
  summaryFailed: 'The ensemble statistics are unavailable right now. Try again in a moment.',
  noPlanValue:
    'Your plan’s own value for this metric is unavailable, so the chart shows the ensemble alone.',
  close: 'Close',
} as const;

export const fillEnsembleText = (
  template: string,
  values: Record<string, string | number>
): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
