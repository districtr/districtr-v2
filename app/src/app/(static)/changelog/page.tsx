import {Flex, Heading, Text, Box, Separator} from '@radix-ui/themes';
import {changelogEntries} from './changelogData';

function formatDate(dateString: string): string {
  // Handle placeholder dates like "2025-01-XX"
  if (dateString.includes('XX')) {
    return dateString.replace(/-XX/g, '');
  }
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export default function ChangelogPage() {
  // Sort entries by date (newest first), handling placeholder dates
  const sortedEntries = [...changelogEntries].sort((a, b) => {
    const dateA = a.date.replace(/-XX/g, '-01');
    const dateB = b.date.replace(/-XX/g, '-01');
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <Flex direction="column" gapY="6" className="max-w-4xl">
      <Heading as="h1" size="8">
        Changelog
      </Heading>
      <Text size="3" color="gray">
        A chronological list of updates, improvements, and new features.
      </Text>

      <Flex direction="column" gapY="6">
        {sortedEntries.map((entry, index) => (
          <Box key={`${entry.date}-${index}`}>
            <Flex direction="column" gapY="3">
              <Flex direction="column" gapY="1">
                <Heading as="h2" size="5">
                  {entry.title}
                </Heading>
                <Text size="2" color="gray">
                  {formatDate(entry.date)}
                </Text>
              </Flex>

              <Box pl="4">
                <ul className="list-disc space-y-2">
                  {entry.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="text-base">
                      {typeof bullet === 'string' ? (
                        <Text size="3">{bullet}</Text>
                      ) : (
                        bullet
                      )}
                    </li>
                  ))}
                </ul>
              </Box>
            </Flex>
            {index < sortedEntries.length - 1 && (
              <Separator size="4" className="mt-6" />
            )}
          </Box>
        ))}
      </Flex>

      {sortedEntries.length === 0 && (
        <Text size="3" color="gray" className="italic">
          No changelog entries yet. Check back soon!
        </Text>
      )}
    </Flex>
  );
}

