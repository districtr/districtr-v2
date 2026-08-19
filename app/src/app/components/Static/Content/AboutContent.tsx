import {Heading, Text, Link} from '@radix-ui/themes';

/**
 * The "Origin Story"/"Our Values"/"Still have questions?" body, shared between
 * the About page and the home page's "About Districtr" section — previously
 * duplicated by hand in both files, which let their wording drift apart.
 * `textSize` lets each caller match its own surrounding text weight.
 */
export const AboutContent: React.FC<{textSize?: React.ComponentProps<typeof Text>['size']}> = ({
  textSize = '3',
}) => (
  <>
    <Heading>Origin Story</Heading>

    <Text size={textSize}>
      The goal of Districtr is to put the tools of redistricting in the hands of the public, with an
      emphasis on meeting the needs of community groups, redistricting commissions, and civil rights
      organizations.
    </Text>

    <Text size={textSize}>
      Districtr came about from a conversation with Lawyers for Civil Rights (LCR), the Boston arm
      of the national Lawyers&apos; Committee for Civil Rights Under Law. LCR was describing their
      work with community members in Lowell, MA, who were frustrated about not having a voice in the
      city council. In those conversations, a few places kept coming up...
    </Text>

    <Text size={textSize}>
      Like <b>Clemente Park</b>, a much-loved meeting point for the city&apos;s Cambodian and Latino
      populations, who felt unsafe at night because the city had not provided lighting...
    </Text>

    <Text size={textSize}>
      And <b>Lowell High School</b>, the city&apos;s only public high school, which serves over 3000
      students. The city announced plans to move it from its traditional downtown location, but
      without sufficient outreach to communities around the city about possible new sites.
    </Text>

    <Text size={textSize}>
      Our idea was to create a mapping tool whose fundamental principle is to{' '}
      <b>ask the community what matters</b>. With maps that build COIs around relevant zones and
      landmarks, paired with community narratives, we can start to see local interests come to life.
    </Text>
    <Heading>Our Values</Heading>

    <Text size={textSize}>
      <b>Accessibility.</b> Participating in the redistricting process should be approachable for
      everyone. Districtr is engineered for maximum accessibility. It&apos;s entirely in-browser
      with no login and no app downloads needed, it works on tablets as well as computers, and we
      assign each plan its own web address for easy sharing.
    </Text>

    <Text size={textSize}>
      <b>Openness and transparency.</b> The entire project began its life as open source, with
      permissive licenses. (We may have to revisit this in the AI era!) We only collect anonymized
      usage data like page views, how you found Districtr, and what size screen you are using.
    </Text>

    <Text size={textSize}>
      <b>Maps not metrics.</b> We don&apos;t think that good maps can be measured in
      one-size-fits-all metrics, so we&apos;ve built a more lightweight mapping experience that
      doesn&apos;t put scores front and center. Newer evaluation functionality lets you access
      metrics when you&apos;re at a stopping point. You can export maps from Districtr in forms that
      can be read in the other major redistricting software.
    </Text>

    <Text size={textSize}>
      <b>All politics is local.</b> We&apos;ve got 760,000-person congressional districts and
      13,000-person city council districts, and every scale in between: county commissions, school
      zones, library boards—you name it, we map it.
    </Text>

    <Text size={textSize}>
      <b>Responsiveness to the community.</b> We aim to highlight specific local rules, principles,
      and priorities whenever possible. We also build event pages for organizers so they can see an
      overview of maps from the group at a glance.
    </Text>
    <Heading className="text-districtrIndigo pt-6">Still have questions?</Heading>

    <Text size={textSize}>
      If you are interested in partnering with us or sponsoring a voting rights project, reach out
      to us at <Link href="mailto:Districtr@data-democracy.org">Districtr@data-democracy.org</Link>.
    </Text>

    <Text size={textSize}>Our team aims to respond to requests for new modules within a week.</Text>
  </>
);
