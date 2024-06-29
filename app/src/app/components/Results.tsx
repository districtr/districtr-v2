import React from "react";

interface ResultsComponentProps {
  results: any[];
}

export const ResultsComponent: React.FC<ResultsComponentProps> = ({
  results,
}) => {
  if (results.length === 0) {
    return <p>No results</p>;
  }

  return (
    <ul>
      {results.map((result, index) => (
        <li key={index}>
          Zone {result[0]}: {Number(result[1])} blocks assigned
        </li>
      ))}
    </ul>
  );
};
