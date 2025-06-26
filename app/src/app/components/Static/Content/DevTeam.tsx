import {Text, Heading} from '@radix-ui/themes';

export const DevTeam: React.FC = () => (
  <>
    <Heading className="text-districtrIndigo pt-6">Development Team</Heading>

    <Text size="3">
      <b>Software Devs:</b> Anna Bailliekova, Nick Doiron, Mario Giampieri, Dylan Halpern, Raphael
      Laude
    </Text>
    <Text size="3">
      <b>Project Team:</b> Chris Donnay (project manager), Moon Duchin
    </Text>
    <Text size="3">
      <b>Past Contributors:</b> Max Hully, Ruth Buck (originating team); Liz Kopecky (past project
      manager); Jamie Atlas, Eion Blanchard, Jack Deschler, Chris Gernon, Peter Horvath, Muniba
      Khan, Zhenghong Lieu, JN Matthews, Anthony Pizzimenti, Heather Rosenfeld, Anna Schall, and
      many more
    </Text>
  </>
);
