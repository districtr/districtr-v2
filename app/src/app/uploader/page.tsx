'use client';
import React, {useState} from 'react';
import Papa from 'papaparse';
import {ErrorNotification} from '../components/ErrorNotification';
import {GerryDBViewSelector} from '../components/sidebar/GerryDBViewSelector';
import {useMapStore} from '@/app/store/mapStore';
import {Assignment, createMapDocument, patchUpdateAssignments} from '@/app/utils/api/apiHandlers';

export default function Uploader() {
  const [progress, setProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [mapLink, setMapLink] = useState('');

  const gTable = useMapStore(state => state.mapDocument?.gerrydb_table);

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
          const {document_id} = response;
          let rowCursor = 0;

          const partialUploadStep = () => {
            const assignments: Assignment[] = [];
            results.data.slice(rowCursor, rowCursor + 120).forEach(row => {
              if (row.length == 2 && row[1] !== '' && !isNaN(1 * row[1])) {
                assignments.push({document_id, geo_id: row[0], zone: Number(row[1])});
              }
            });
            patchUpdateAssignments(assignments).then(stepResult => {
              setProgress(rowCursor + assignments.length);
              rowCursor += 120;
              if (rowCursor > results.data.length) {
                setMapLink(document_id);
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

  const handleFileSelected = (event: React.ChangeEvent) => {
    const file = event.target.files?.[0];
    processFile(file);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div
        className="w-96 h-96 border-2 border-dashed border-gray-400 rounded-lg flex flex-col items-center justify-center bg-white"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ErrorNotification />

        {totalRows ? (
          <div className="w-52 mb-4">
            <div className="flex">
              {progress === 0 ? 'Initializing map...' : null}
              {mapLink !== '' ? (
                <a
                  className="text-blue-500 underline"
                  href={`/map?document_id=${mapLink}`}
                  target="_blank"
                >
                  Uploaded to {mapLink}
                </a>
              ) : null}
            </div>
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
        <label className="px-4 py-2 rounded cursor-pointer hover:bg-blue-600">
          Choose the map table
        </label>
        <div className="mb-3">
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
    </div>
  );
}
