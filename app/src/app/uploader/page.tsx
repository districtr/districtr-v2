'use client';
import React, {useState} from 'react';
import Papa from 'papaparse';
import {ErrorNotification} from '../components/ErrorNotification';
import {GerryDBViewSelector} from '../components/sidebar/GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {Assignment, uploadAssignments} from '@/app/utils/api/apiHandlers';

type MapLink = {
  document_id: string;
  name: string;
};

export default function Uploader() {
  const [totalRows, setTotalRows] = useState<number>(0);
  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);

  const ROWS_PER_BATCH = 20000000000;

  const gTable = useMapStore(state => state.mapDocument?.gerrydb_table);
  const upsertUserMap = useMapStore(state => state.upsertUserMap);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const processFile = (file: File) => {
    if (!file) {
      throw new Error('No file selected');
      return;
    }

    Papa.parse(file, {
      complete: results => {
        setTotalRows(results.data.length);
        let rowCursor = 0;
        let uploadRows: [string, string][] = [];

        const partialUploadStep = () => {
          const assignments: Assignment[] = [];
          const rows = results.data as Array<Array<string>>;
          rows.slice(rowCursor, rowCursor + ROWS_PER_BATCH).forEach(row => {
            if (row.length == 2 && !isNaN(Number(row[1]))) {
              uploadRows.push([row[0], row[1]]);
            }
          });
          uploadAssignments({assignments: uploadRows, gerrydb_table_name: gTable ?? ''}).then(stepResult => {
            uploadRows = [];
            rowCursor += ROWS_PER_BATCH;
            if (rowCursor > results.data.length) {
              setMapLinks([...mapLinks, {document_id: stepResult.document_id, name: file.name}]);
            } else {
              setTimeout(partialUploadStep, 10);
            }
          });
        };
        partialUploadStep();
      },
    });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    processFile(file);
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div className="flex gap-4">
        <div
          className="w-96 h-96 border-2 border-dashed border-gray-400 rounded-lg flex flex-col items-center justify-center bg-white"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ErrorNotification />

          <h3 className="text-lg font-semibold text-gray-700 mb-4">Upload CSV</h3>
          <label className="px-4 py-2 rounded">Choose the map table</label>
          <div className="mb-3 border-2 p-1">
            <GerryDBViewSelector />
          </div>
          <input
            type="file"
            name="uploader"
            className="hidden"
            id="file-input"
            onChange={handleFileSelected}
          />
          <label
            htmlFor="file-input"
            className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-600"
          >
            Choose a file
          </label>
          <p className="text-gray-500 mt-2">Or drag and drop a file here</p>
        </div>
        {mapLinks.length > 0 ? (
          <div className="w-45 h-96 border-2 border-gray-400 rounded-lg flex flex-col items-center p-4 bg-white">
            <h3>Uploads</h3>
            {mapLinks.map(map => (
              <a
                className="text-blue-500 underline"
                href={`/map?document_id=${map.document_id}`}
                key={map.document_id}
                target="_blank"
              >
                {map.name}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
