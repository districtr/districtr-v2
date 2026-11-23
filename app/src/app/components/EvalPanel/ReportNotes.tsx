'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Heading, Text} from '@radix-ui/themes';
import {DEMOGRAPHICS_SOURCE} from '@components/sidebar/DataSourceCitation';

/**
 * The notes a report can carry, in the order the Notes section lists them: the
 * order in which the report first points at each.
 */
const REPORT_NOTES = ['geography', 'population', 'electionResults', 'freedomToVoteTest'] as const;
export type ReportNoteKey = (typeof REPORT_NOTES)[number];

/** Where the report's data come from: one note per kind of data. */
export const DATA_SOURCE_NOTES = {
  geography: {
    note: 'geography',
    title: 'Geography',
    text:
      'Districts are built from Census blocks, block groups or VTDs. Their shapes come from the ' +
      "2020 distribution of the U.S. Census Bureau's TIGER/Line Shapefiles.",
  },
  population: {
    note: 'population',
    title: 'Population',
    text: `Population counts are from the ${DEMOGRAPHICS_SOURCE}, by census block. Totals for larger units are sums of their blocks.`,
  },
  electionResults: {
    note: 'electionResults',
    title: 'Election results',
    text: "The sources of the election results are listed on Districtr's Data page, districtr.org/data.",
  },
} as const satisfies Record<string, {note: ReportNoteKey; title: string; text: string}>;

interface NoteEntry {
  /** References to the note now on the page. */
  count: number;
  title: string;
  text: string;
}

interface ReportNotesContextValue {
  /** The notes the report's text points at, in note order. */
  referenced: ReportNoteKey[];
  entries: Partial<Record<ReportNoteKey, NoteEntry>>;
  /** Called by a reference while it is on the page; returns its sign-off. */
  register: (note: ReportNoteKey, title: string, text: string) => () => void;
}

const ReportNotesContext = createContext<ReportNotesContextValue>({
  referenced: [],
  entries: {},
  register: () => () => {},
});

/**
 * Keeps the notes the report's text points at, so the Notes section lists a note
 * once however many places refer to it, and leaves out a note nothing refers to.
 */
export const ReportNotesProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [entries, setEntries] = useState<Partial<Record<ReportNoteKey, NoteEntry>>>({});
  const register = useCallback((note: ReportNoteKey, title: string, text: string) => {
    const add = (by: number) =>
      setEntries(was => ({...was, [note]: {count: (was[note]?.count ?? 0) + by, title, text}}));
    add(1);
    return () => add(-1);
  }, []);
  const value = useMemo(
    () => ({
      referenced: REPORT_NOTES.filter(note => (entries[note]?.count ?? 0) > 0),
      entries,
      register,
    }),
    [entries, register]
  );
  return <ReportNotesContext.Provider value={value}>{children}</ReportNotesContext.Provider>;
};

interface ReportNoteRefProps {
  note: ReportNoteKey;
  title: string;
  text: string;
}

/**
 * The superscript number that points from the text to a note. The reference
 * brings the note's title and text along; several references to one note share
 * its number.
 */
export const ReportNoteRef: React.FC<ReportNoteRefProps> = ({note, title, text}) => {
  const {referenced, register} = useContext(ReportNotesContext);
  useEffect(() => register(note, title, text), [register, note, title, text]);
  const number = referenced.indexOf(note) + 1;
  if (number === 0) return null;
  return <sup>{number}</sup>;
};

/** The report's closing section: what the screen shows as hover help or leaves out. */
export const ReportNotes: React.FC = () => {
  const {referenced, entries} = useContext(ReportNotesContext);
  if (!referenced.length) return null;
  return (
    <section className="eval-report-notes">
      <Heading as="h2" size="5" className="eval-report-heading-plain">
        Notes
      </Heading>
      <ol>
        {referenced.map(note => (
          <li key={note}>
            <Text size="2">
              <strong>{entries[note]?.title}.</strong> {entries[note]?.text}
            </Text>
          </li>
        ))}
      </ol>
    </section>
  );
};
