'use client';
import { Box, Flex, Grid, Heading, Text } from '@radix-ui/themes';
import { NavigationCard } from '../components/NavigationCard';

export default function ReviewHome() {
  return (
    <Flex direction="column" gap="4">
      <Box>
        <Heading>Comment Review Dashboard</Heading>
        <Text>Review and moderate comments, tags, and commenters</Text>
      </Box>
      <Grid columns={{
        initial: '1',
        md: '2',
        lg: '3',
      }} gap="4">
        <NavigationCard route="/admin/review/comments" text="Comments" description="Review and moderate user comments for appropriate content." cta="Review Comments" />
        <NavigationCard route="/admin/review/tags" text="Tags" description="Review and moderate tags used to categorize comments." cta="Review Tags" />
        <NavigationCard route="/admin/review/commenters" text="Commenters" description="Review and moderate user accounts and their information." cta="Review Commenters" />
      </Grid>
    </Flex>
  );
}
