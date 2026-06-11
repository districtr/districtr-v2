'use server';

import {AuthError} from 'next-auth';
import {redirect} from 'next/navigation';
import {signIn} from '@/auth';

/** Only allow same-origin relative redirect targets. */
const sanitizeReturnTo = (returnTo: FormDataEntryValue | null): string =>
  typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/admin';

export async function loginAction(formData: FormData): Promise<void> {
  const returnTo = sanitizeReturnTo(formData.get('returnTo'));
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: returnTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Bad credentials — bounce back to the login page with an error flag
      redirect(`/auth/login?error=CredentialsSignin&returnTo=${encodeURIComponent(returnTo)}`);
    }
    // Success: signIn throws a NEXT_REDIRECT to returnTo — let it propagate
    throw error;
  }
}
