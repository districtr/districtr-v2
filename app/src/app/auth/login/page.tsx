import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {Box, Button, Card, Flex, Heading, Text, TextField} from '@radix-ui/themes';
import {getServerSession} from '@/app/lib/auth';
import {loginAction} from './actions';

export const metadata: Metadata = {
  title: 'Sign in - Districtr',
  description: 'Sign in to Districtr',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{returnTo?: string; error?: string}>;
}) {
  const params = await searchParams;
  const returnTo =
    params.returnTo && params.returnTo.startsWith('/') && !params.returnTo.startsWith('//')
      ? params.returnTo
      : '/admin';

  // Already signed in — go straight to the destination
  const session = await getServerSession();
  if (session?.user) {
    redirect(returnTo);
  }

  return (
    <Flex align="center" justify="center" className="min-h-screen bg-gray-100">
      <Card size="3" className="w-full max-w-md">
        <Flex direction="column" gap="4" p="4">
          <Heading size="5">Sign in to Districtr</Heading>
          {params.error && (
            <Text size="2" color="red">
              Invalid email or password. Please try again.
            </Text>
          )}
          <form action={loginAction}>
            <Flex direction="column" gap="3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="email">
                  Email
                </Text>
                <TextField.Root
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="username"
                  required
                />
              </Box>
              <Box>
                <Text as="label" size="2" weight="medium" htmlFor="password">
                  Password
                </Text>
                <TextField.Root
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </Box>
              <Button type="submit" size="3">
                Sign in
              </Button>
            </Flex>
          </form>
        </Flex>
      </Card>
    </Flex>
  );
}
