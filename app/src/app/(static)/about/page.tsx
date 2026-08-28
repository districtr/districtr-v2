import {CTA} from '@/app/components/Static/Content/CTA';
import {DevTeam} from '@/app/components/Static/Content/DevTeam';
import {AboutContent} from '@/app/components/Static/Content/AboutContent';
import {Flex, Heading} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';

export const metadata = {
  title: 'About',
  description: 'Who builds Districtr and why',
};

export default function AboutPage() {
  return (
    <Flex direction="column" gapY="4">
      <LearnSubNav />
      <Heading as="h1" size="8">
        About Districtr
      </Heading>
      <Flex direction="column" gapY="4" py="4">
        <AboutContent />
        <DevTeam />
        <CTA />
      </Flex>
    </Flex>
  );
}
