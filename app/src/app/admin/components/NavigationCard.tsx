import React from 'react';
import {useRouter} from 'next/navigation';
import {Card, Heading, Button, Text, Flex} from '@radix-ui/themes';

export const NavigationCard: React.FC<{
  route: string;
  text: string;
  description: string;
  cta: string;
}> = ({route, text, description, cta}) => {
  const router = useRouter();

  const handleClick = () => {
    router.push(route);
  };

  return (
    <Card className="p-4" variant="surface">
      <Flex direction="column" gap="2" align="start">
        <Heading>{text}</Heading>
        <Text>{description}</Text>
        <Button onClick={handleClick} size="2" className="mt-4" variant="soft">
          {cta}
        </Button>
      </Flex>
    </Card>
  );
};
