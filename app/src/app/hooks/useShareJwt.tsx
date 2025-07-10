import {jwtDecode} from 'jwt-decode';
import {useSearchParams} from 'next/navigation';

export const useShareJwt = () => {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get('share');
  const decodedToken = shareToken && jwtDecode(shareToken);
  return decodedToken as null | {
    token: string;
    access: 'read' | 'edit';
    password_required: boolean;
  };
};
