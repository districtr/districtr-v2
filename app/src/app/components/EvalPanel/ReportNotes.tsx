'use client';
import {Heading, Text} from '@radix-ui/themes';
import {helpTipContent, type HelpTipKey} from '@components/HelpTip/helpTipContent';

/** Help tips the report prints as numbered notes, in note order. */
const REPORT_NOTES: HelpTipKey[] = ['freedomToVoteTest'];

/** The superscript number that points from the text to a note. */
export const ReportNoteRef: React.FC<{tip: HelpTipKey}> = ({tip}) => {
  const number = REPORT_NOTES.indexOf(tip) + 1;
  if (number === 0) return null;
  return <sup className="eval-report-note-ref">{number}</sup>;
};

/** The report's closing section: what the screen shows as hover help. */
export const ReportNotes: React.FC = () => {
  return (
    <section className="eval-report-notes">
      <Heading as="h2" size="5" className="eval-report-heading-plain">
        Notes
      </Heading>
      <ol>
        {REPORT_NOTES.map(tip => (
          <li key={tip}>
            <Text size="2">
              <strong>{helpTipContent[tip].title}.</strong> {helpTipContent[tip].text}
            </Text>
          </li>
        ))}
      </ol>
    </section>
  );
};
