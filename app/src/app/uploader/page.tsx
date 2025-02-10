'use client';
import React, {useState} from 'react';
import Papa from 'papaparse';
import {ErrorNotification} from '../components/ErrorNotification';
import {GerryDBViewSelector} from '../components/sidebar/GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {Assignment, createMapDocument, uploadAssignments} from '@/app/utils/api/apiHandlers';

type MapLink = {
  document_id: string;
  name: string;
};

export default function Uploader() {
  const [progress, setProgress] = useState<number>(0);
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
        setProgress(0);
        setTotalRows(results.data.length);

        createMapDocument({
          gerrydb_table: gTable ?? '',
        }).then(response => {
          upsertUserMap({
            mapDocument: response,
          });
          const {document_id} = response;
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
            uploadAssignments({assignments: uploadRows, document_id}).then(stepResult => {
              setProgress(rowCursor + assignments.length);
              uploadRows = [];
              rowCursor += ROWS_PER_BATCH;
              if (rowCursor > results.data.length) {
                setMapLinks([...mapLinks, {document_id, name: file.name}]);
              } else {
                setTimeout(partialUploadStep, 10);
              }
            });
          };
          setProgress(0);
          partialUploadStep();
        });
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

          {totalRows ? (
            <div className="w-52 mb-4">
              <div className="flex">{progress === 0 ? 'Initializing map...' : null}</div>
              <div className="flex justify-between">
                <span>
                  {progress}/{totalRows} rows
                </span>
                <span>{Math.round((progress / totalRows) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{width: `${(progress / totalRows) * 100}%`}}
                ></div>
              </div>
            </div>
          ) : null}

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
