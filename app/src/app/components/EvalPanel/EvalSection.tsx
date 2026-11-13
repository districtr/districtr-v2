'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Heading, Text} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {useIsReport} from './evalMode';

interface EvalSectionProps {
  /** Accordion item id. */
  value: string;
  title: string;
  children: React.ReactNode;
}

/**
 * One top-level section of the evaluation: a collapsible accordion on screen, an
 * always-open numbered section in the report (numbers come from CSS counters).
 */
export const EvalSection: React.FC<EvalSectionProps> = ({value, title, children}) => {
  const isReport = useIsReport();
  if (isReport) {
    return (
      <section className="eval-report-section">
        <Heading as="h2" size="5" className="eval-report-heading">
          {title}
        </Heading>
        {children}
      </section>
    );
  }
  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value={value}>
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
            <TriangleRightIcon
              width={16}
              height={16}
              className="transition-transform duration-200 group-data-[state=open]:rotate-90"
            />
            <Heading size="5">{title}</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content className="pl-8">{children}</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};

/** A subsection title inside an EvalSection: centred on screen, numbered in the report. */
export const EvalSubheading: React.FC<{children: React.ReactNode}> = ({children}) => {
  const isReport = useIsReport();
  if (isReport) {
    return (
      <Heading as="h3" size="3" mb="2" mt="4" className="eval-report-subheading">
        {children}
      </Heading>
    );
  }
  return (
    <Heading size="3" align="center" mb="2" mt="4">
      {children}
    </Heading>
  );
};

interface EvalTableTitleProps {
  children: React.ReactNode;
  /** Extra space above, for a title that follows running text. */
  spaced?: boolean;
  /** A caption the report needs and the screen does not. */
  reportOnly?: boolean;
  /** Render as a span, for a title that shares its line with a control. */
  inline?: boolean;
}

/** A table's title: bold text on screen, a numbered caption ("Table 3. …") in the report. */
export const EvalTableTitle: React.FC<EvalTableTitleProps> = ({
  children,
  spaced,
  reportOnly,
  inline,
}) => {
  const isReport = useIsReport();
  if (!isReport && reportOnly) return null;
  const className = isReport ? 'eval-report-table-title' : undefined;
  if (inline) {
    return (
      <Text size="2" weight={isReport ? undefined : 'bold'} className={className}>
        {children}
      </Text>
    );
  }
  return (
    <Text
      size="2"
      weight={isReport ? undefined : 'bold'}
      mb="2"
      mt={spaced ? '4' : undefined}
      as="p"
      className={className}
    >
      {children}
    </Text>
  );
};
