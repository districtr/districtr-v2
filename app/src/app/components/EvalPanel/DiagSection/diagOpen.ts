import {uploadAssignments} from '@utils/api/apiHandlers/uploadAssignments';
import {saveMapDocumentMetadata} from '@utils/api/apiHandlers/saveMapDocumentMetadata';
import {assignmentPairs, decodeRow, diagDocumentName, rangeIndexOf} from './diagCodec';
import {getDiagNodes, getDiagRange} from './diagData';
import {loadLocalRegistry, saveLocalRegistry, upsertEntry} from './diagRegistry';
import type {DiagPresetIndex, DiagRegistryEntry} from './diagTypes';

/**
 * Create a document holding the plan at `step` of a preset and record it in the
 * browser's registry. The backend takes the package's parent (VTD) unit ids
 * directly. Only the public id is kept: the document UUID is the edit capability.
 */
export const openDiagPlan = async ({
  module,
  folder,
  preset,
  step,
}: {
  module: string;
  folder: string;
  preset: DiagPresetIndex;
  step: number;
}): Promise<DiagRegistryEntry> => {
  if (!Number.isInteger(step) || step < 0 || step >= preset.n_plans) {
    throw new Error(`Step must be an integer from 0 to ${preset.n_plans - 1}`);
  }
  const [nodes, range] = await Promise.all([
    getDiagNodes(folder, preset.preset),
    getDiagRange(folder, preset.preset, rangeIndexOf(step, preset.range_size)),
  ]);
  const assignments = assignmentPairs(nodes, decodeRow(range, step, preset.n_nodes));
  const result = await uploadAssignments({assignments, districtr_map_slug: module});
  if (!result.ok || !result.response?.public_id) {
    throw new Error(`Could not create the document: ${JSON.stringify(result)}`.slice(0, 300));
  }
  const {document_id, public_id} = result.response;
  // Best effort: the name only helps recognise the document in the database.
  await saveMapDocumentMetadata({
    document_id,
    metadata: {name: diagDocumentName(module, preset.preset, step)},
  }).catch(() => undefined);
  const entry: DiagRegistryEntry = {
    preset: preset.preset,
    step,
    public_id,
    note: '',
    when: new Date().toISOString(),
  };
  saveLocalRegistry(
    localStorage,
    module,
    upsertEntry(loadLocalRegistry(localStorage, module), entry)
  );
  return entry;
};

export const evalPath = (publicId: number) => `/map/${publicId}/eval`;
