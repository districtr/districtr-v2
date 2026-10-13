import {Text, Heading} from '@radix-ui/themes';

export const DevTeam: React.FC = () => (
  <>
    <Heading className="text-districtrIndigo pt-6">Development Team</Heading>

    <Text size="3">
      <b>Software Devs:</b> Dylan Halpern, Ge Fang
    </Text>
    <Text size="3">
      <b>Project Team:</b> Peter Rock, Moon Duchin
    </Text>
    <Text size="3">
      <b>Past Contributors:</b> (originating team) Ruth Buck, Max Hully; (past project managers) Liz
      Kopecky, Chris Donnay; (past dev lead) Nick Doiron; (other contributors) Anna Bailliekova,
      Mario Giampieri, Raphael Laude, Jamie Atlas, Eion Blanchard, Jack Deschler, Chris Gernon,
      Peter Horvath, Muniba Khan, Zhenghong Lieu, JN Matthews, Anthony Pizzimenti, Heather
      Rosenfeld, Anna Schall, and many more.
    </Text>
  </>
);
