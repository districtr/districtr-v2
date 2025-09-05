'use client';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {Flex, Spinner, Text} from '@radix-ui/themes';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredScope: string;
  fallback?: React.ReactNode;
}
const StatusText: React.FC<{
  status: string;
  fallback?: React.ReactNode;
  requiredScope: string;
}> = ({status, fallback, requiredScope}) => {
  switch (status) {
    case 'No session':
      return (
        fallback || (
          <>
            <Spinner />
            <Text size="2">No user session found...</Text>
            <Text size="2">If this error persists, try logging out and logging back in.</Text>
          </>
        )
      );
    case 'No access token':
      return (
        fallback || (
          <>
            <Text size="2">No access token found...</Text>
            <Text size="2">If this error persists, try logging out and logging back in.</Text>
          </>
        )
      );
    case 'Missing permission':
      return (
        fallback || (
          <>
            <Text size="2">You don't have the required permissions to access this page.</Text>
            <Text size="2">Please contact an administrator if you believe this is an error.</Text>
            <Text size="2">Required permission: {status}</Text>
          </>
        )
      );
    case 'Error parsing token':
      return (
        fallback || (
          <>
            <Text size="2">Error parsing token...</Text>
            <Text size="2">Please contact an administrator if you believe this is an error.</Text>
            <Text size="2">Required permission: {status}</Text>
          </>
        )
      );
  }
};
export default function PermissionGuard({children, requiredScope, fallback}: PermissionGuardProps) {
  const session = useCmsFormStore(state => state.session);

  const getPermissionStatus = () => {
    if (!session) {
      return 'No session';
    }
    if (!session?.tokenSet?.accessToken) {
      return 'No access token';
    }

    // Parse the JWT token to check scopes (in a real app, you might want to do this server-side)
    try {
      const payload = JSON.parse(atob(session.tokenSet.accessToken.split('.')[1]));
      const scopes = payload.scope ? payload.scope.split(' ') : [];
      return scopes.includes(requiredScope) ? 'Has permission' : 'Missing permission';
    } catch (error) {
      console.error('Error parsing token:', error);
      return 'Error parsing token';
    }
  };
  const permissionStatus = getPermissionStatus();
  if (permissionStatus === 'Has permission') {
    return <>{children}</>;
  }
  return (
    <Flex direction="column" gap="2" className="w-min-content" align="center" justify="center">
      <StatusText status={permissionStatus} fallback={fallback} requiredScope={requiredScope} />
    </Flex>
  );
}
