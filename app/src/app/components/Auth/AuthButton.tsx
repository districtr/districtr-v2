'use client';
import {Button, Flex, Text} from '@radix-ui/themes';
import {useAuthRoutes} from '../../hooks/useAuthRoutes';
import {useCmsFormStore} from '@/app/store/cmsFormStore';

export const AuthButton = () => {
  const user = useCmsFormStore(state => state.session?.user);
  const {signOut, signIn} = useAuthRoutes();

  return (
    <Flex gap="2" p="2" align="center" direction="row">
      {user ? (
        <>
          <Text>{user.name || user.email}</Text>
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
