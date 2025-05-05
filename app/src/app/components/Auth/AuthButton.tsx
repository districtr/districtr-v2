'use client';
import {Button, Flex, Text} from '@radix-ui/themes';
import {useAuthRoutes} from '../../hooks/useAuthRoutes';
import {useUser} from '@auth0/nextjs-auth0';

export const AuthButton = () => {
  const {user} = useUser();
  const {signOut, signIn} = useAuthRoutes();

  return (
    <Flex gap="2" p="2" align="center" direction="row">
      {user ? (
        <>
          <Flex direction="row" gap="1">
            {' '}
            {!!user?.picture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt={user.name || 'Profile Image'}
                className="size-6 rounded-full"
              />
            )}
            <Text>{user?.name}</Text>
          </Flex>
          <Button variant="surface" onClick={() => signOut()}>
            Sign out
          </Button>
        </>
      ) : (
        <>
          <Text size="2" color="gray">
            Not Signed In
          </Text>
          <Button onClick={() => signIn()}>Sign in</Button>
        </>
      )}
    </Flex>
  );
};
