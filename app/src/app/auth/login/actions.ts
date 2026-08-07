'use server';

import {AuthError} from 'next-auth';
import {redirect} from 'next/navigation';
import {signIn} from '@/auth';
import {sanitizeReturnTo} from '@/app/utils/sanitizeReturnTo';

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
