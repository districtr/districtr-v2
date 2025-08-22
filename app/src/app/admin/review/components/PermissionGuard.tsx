'use client';
import {useCmsFormStore} from '@/app/store/cmsFormStore';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredScope: string;
  fallback?: React.ReactNode;
}

export default function PermissionGuard({children, requiredScope, fallback}: PermissionGuardProps) {
  const session = useCmsFormStore(state => state.session);

  const hasPermission = () => {
    if (!session?.tokenSet?.accessToken) {
      return false;
    }

    // Parse the JWT token to check scopes (in a real app, you might want to do this server-side)
    try {
      const payload = JSON.parse(atob(session.tokenSet.accessToken.split('.')[1]));
      const scopes = payload.scope ? payload.scope.split(' ') : [];
      return scopes.includes(requiredScope);
    } catch (error) {
      console.error('Error parsing token:', error);
      return false;
    }
  };

  if (!hasPermission()) {
    return (
      fallback || (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto mt-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-2xl">🚫</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Access Denied</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You don&apos;t have the required permissions to access this page. Please contact
                  an administrator if you believe this is an error.
                </p>
                <p className="mt-2 text-xs">Required permission: {requiredScope}</p>
              </div>
            </div>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
}
