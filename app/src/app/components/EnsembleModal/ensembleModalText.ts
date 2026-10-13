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
