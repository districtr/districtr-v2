'use client';
import * as hy from 'hyparquet';
import {compressors} from 'hyparquet-compressors';
import {useEffect} from 'react';

const url = '/output_with_kv_test_long2.parquet';

const main = async () => {
  const byteLength = await hy.byteLengthFromUrl(url).then(Number);
  const file = await hy.asyncBufferFromUrl({url, byteLength});
  const metadata = await hy.parquetMetadataAsync(file);
  console.log('metadata', metadata);
  return;
  const _colList = metadata.key_value_metadata.find(m => m.key === 'column_list');
  const colList = _colList ? JSON.parse(_colList.value) : [];
  const _lengthList = metadata.key_value_metadata.find(m => m.key === 'length_list');
  const lengthList = _lengthList ? JSON.parse(_lengthList.value) : [];
  const rowIndicies = {
    parent: [0, lengthList[0]],
  };
  const parents = await hy.parquetReadObjects({
    // columns: ["path", "total_pop_20"],
    compressors,
    file,
    metadata,
    // onComplete: console.log,
    rowStart: rowIndicies['parent'][0],
    rowEnd: rowIndicies['parent'][1],
    utf8: false,
  });
  console.log(parents);
  // const getDemographyOfBrokenVtd = async (id) => {
  //   return await hy.parquetReadObjects({
  //     file,
  //     metadata,
  //     compressors,
  //     // onComplete: console.log,
  //     rowStart: kvMetadata[id][0],
  //     rowEnd: kvMetadata[id][1]
  //   })
  // }
  // console.log(await getDemographyOfBrokenVtd("vtd:48001000005"))
};
export default function TestPage() {
  useEffect(() => {
    main();
  }, []);

  return <div>Test</div>;
}
