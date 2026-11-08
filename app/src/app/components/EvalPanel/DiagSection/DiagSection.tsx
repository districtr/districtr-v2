'use client';
import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {headlineMetrics, metricAt, rangeIndexOf} from './diagCodec';
import {
  getDiagModuleIndex,
  getDiagPresetIndex,
  getDiagRange,
  getDiagSeedRegistry,
} from './diagData';
import {evalPath, openDiagPlan} from './diagOpen';
import {
  entryId,
  loadLocalRegistry,
  mergeRegistries,
  registryExport,
  saveLocalRegistry,
} from './diagRegistry';
import type {DiagPresetIndex, DiagRange, DiagRegistryEntry} from './diagTypes';

const btn = 'border border-gray-400 rounded px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-50';

const fmt = (v: number | undefined) =>
  v === undefined ? '…' : Number.isInteger(v) ? String(v) : v.toFixed(4);

/** Range files for a set of steps, loaded as they arrive. */
const useRanges = (module: string, presetPath: string, preset: DiagPresetIndex | undefined, steps: number[]) => {
  const [ranges, setRanges] = useState<Record<number, DiagRange>>({});
  const key = steps.join(',');
  useEffect(() => {
    if (!preset) return;
    let live = true;
    const ks = [...new Set(steps.map(s => rangeIndexOf(s, preset.range_size)))];
    ks.forEach(k =>
      getDiagRange(module, presetPath, k)
        .then(r => live && setRanges(prev => ({...prev, [k]: r})))
        .catch(() => undefined)
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, presetPath, preset, key]);
  return ranges;
};

export const DiagSection: React.FC = () => {
  const module = useMapStore(state => state.mapDocument?.districtr_map_slug) ?? '';
  const router = useRouter();

  const {data: moduleIndex} = useQuery({
    queryKey: ['diag', 'index', module],
    queryFn: () => getDiagModuleIndex(module),
    enabled: !!module,
    staleTime: Infinity,
    retry: false,
  });
  const presets = moduleIndex?.presets ?? [];
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const presetEntry = presets.find(p => p.key === presetKey) ?? presets[0];
  const presetPath = presetEntry?.path ?? '';

  const {data: preset} = useQuery({
    queryKey: ['diag', 'preset', module, presetPath],
    queryFn: () => getDiagPresetIndex(module, presetPath),
    enabled: !!presetEntry,
    staleTime: Infinity,
    retry: false,
  });

  const [local, setLocal] = useState<DiagRegistryEntry[]>([]);
  const [seed, setSeed] = useState<DiagRegistryEntry[]>([]);
  useEffect(() => {
    if (module) setLocal(loadLocalRegistry(localStorage, module));
  }, [module]);
  useEffect(() => {
    let live = true;
    Promise.all(presets.map(p => getDiagSeedRegistry(module, p.path)))
      .then(all => live && setSeed(all.flat()))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, moduleIndex]);
  const registry = useMemo(() => mergeRegistries(seed, local), [seed, local]);
  const known = (step: number) =>
    registry.find(e => e.preset === preset?.preset && e.step === step);

  const [metricKey, setMetricKey] = useState<string | null>(null);
  const [bucketIdx, setBucketIdx] = useState(0);
  const [stepText, setStepText] = useState('');
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bucketMetrics = Object.keys(preset?.buckets ?? {});
  const activeMetric = metricKey && bucketMetrics.includes(metricKey) ? metricKey : bucketMetrics[0];
  const buckets = (activeMetric && preset?.buckets[activeMetric]) || [];
  const bucket = buckets[Math.min(bucketIdx, buckets.length - 1)];
  const rows: {step: number; tag: string}[] = bucket
    ? [
        ...bucket.steps.map(step => ({step, tag: ''})),
        ...(activeMetric && preset?.min_step[activeMetric] !== undefined
          ? [{step: preset.min_step[activeMetric], tag: 'min'}]
          : []),
        ...(activeMetric && preset?.max_step[activeMetric] !== undefined
          ? [{step: preset.max_step[activeMetric], tag: 'max'}]
          : []),
      ]
    : [];
  const headline = useMemo(() => headlineMetrics(preset?.metrics ?? []), [preset]);
  const shownStepNums = [...rows.map(r => r.step), ...(shown !== null ? [shown] : [])];
  const ranges = useRanges(module, presetPath, preset, shownStepNums);
  const rangeFor = (step: number) =>
    preset ? ranges[rangeIndexOf(step, preset.range_size)] : undefined;

  if (!moduleIndex || !presetEntry) return null;

  const open = async (step: number) => {
    if (!preset) return;
    const existing = known(step);
    if (existing) {
      router.push(evalPath(existing.public_id));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await openDiagPlan({module, presetPath, preset, step});
      router.push(evalPath(entry.public_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setNote = (e: DiagRegistryEntry, note: string) => {
    const next = [...local.filter(l => entryId(l) !== entryId(e)), {...e, note}];
    setLocal(next);
    saveLocalRegistry(localStorage, module, next);
  };

  const stepNum = Number(stepText);
  const stepValid = stepText.trim() !== '' && Number.isInteger(stepNum) && !!preset &&
    stepNum >= 0 && stepNum < preset.n_plans;

  return (
    <div className="mx-5 mb-4 border border-dashed border-gray-400 p-3 text-xs flex flex-col gap-3">
      <div>
        <b>Diagnosis</b> · {module}
        {presets.length > 1 && (
          <select
            className="ml-2 border"
            value={presetEntry.key}
            onChange={e => {
              setPresetKey(e.target.value);
              setBucketIdx(0);
              setShown(null);
            }}
          >
            {presets.map(p => (
              <option key={p.key} value={p.key}>
                {p.key}
              </option>
            ))}
          </select>
        )}
        {preset && (
          <span>
            {' '}
            · {preset.n_plans.toLocaleString()} plans · {preset.n_districts} districts · weights{' '}
            {JSON.stringify(preset.weights)}
          </span>
        )}
      </div>

      {preset && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex gap-2 items-center">
              <select
                className="border"
                value={activeMetric}
                onChange={e => {
                  setMetricKey(e.target.value);
                  setBucketIdx(0);
                }}
              >
                {bucketMetrics.map(k => (
                  <option key={k} value={k}>
                    {preset.metrics.find(m => m.key === k)?.label ?? k}
                  </option>
                ))}
              </select>
              <select
                className="border"
                value={bucketIdx}
                onChange={e => setBucketIdx(Number(e.target.value))}
              >
                {buckets.map((b, i) => (
                  <option key={b.label} value={i}>
                    {b.label} ({fmt(b.range[0])} to {fmt(b.range[1])})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-gray-500">
              Columns matched: {headline.map(h => `${h.role} = ${h.info.key}`).join('; ') || 'none'}
            </div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Step</th>
                  {headline.map(h => (
                    <th key={h.role}>{h.role}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({step, tag}) => {
                  const r = rangeFor(step);
                  const existing = known(step);
                  return (
                    <tr key={`${step}-${tag}`}>
                      <td>
                        {step} {tag && <i>({tag})</i>}
                      </td>
                      {headline.map(h => (
                        <td key={h.role}>{r ? fmt(metricAt(r, h.info.key, step)) : '…'}</td>
                      ))}
                      <td className="flex gap-1">
                        <button className={btn} onClick={() => setShown(step)}>
                          Metrics
                        </button>
                        {existing ? (
                          <a className={btn} href={evalPath(existing.public_id)}>
                            Existing plan
                          </a>
                        ) : (
                          <button className={btn} disabled={busy} onClick={() => open(step)}>
                            Open in Districtr
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 items-center">
            Step
            <input
              className="border w-28 px-1"
              type="number"
              min={0}
              max={preset.n_plans - 1}
              value={stepText}
              onChange={e => setStepText(e.target.value)}
            />
            <button className={btn} disabled={!stepValid} onClick={() => setShown(stepNum)}>
              Show metrics
            </button>
            <button className={btn} disabled={!stepValid || busy} onClick={() => open(stepNum)}>
              Open in Districtr
            </button>
            <button
              className={btn}
              onClick={() => setStepText(String(Math.floor(Math.random() * preset.n_plans)))}
            >
              Random step
            </button>
          </div>

          {shown !== null && (
            <StepMetrics preset={preset} step={shown} range={rangeFor(shown)} />
          )}
        </>
      )}

      {error && <div className="text-red-600">{error}</div>}
      {busy && <div>Creating document…</div>}

      <div>
        <div className="flex gap-2 items-center">
          <b>Opened plans</b>
          <button
            className={btn}
            onClick={() => navigator.clipboard.writeText(registryExport(local))}
          >
            Copy registry
          </button>
        </div>
        {registry.length === 0 && <div className="text-gray-500">None yet.</div>}
        {registry.map(e => (
          <div key={entryId(e)} className="flex gap-2 items-center">
            <a className="underline" href={evalPath(e.public_id)}>
              {e.preset} step {e.step}
            </a>
            <input
              className="border flex-1 px-1"
              placeholder="note"
              value={e.note}
              onChange={ev => setNote(e, ev.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const StepMetrics: React.FC<{preset: DiagPresetIndex; step: number; range?: DiagRange}> = ({
  preset,
  step,
  range,
}) => (
  <div>
    <b>Step {step}</b>
    {!range ? (
      <span> loading…</span>
    ) : (
      <table>
        <tbody>
          {preset.metrics.map(m => (
            <tr key={m.key}>
              <td className="pr-3">{m.label}</td>
              <td>{fmt(metricAt(range, m.key, step))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
