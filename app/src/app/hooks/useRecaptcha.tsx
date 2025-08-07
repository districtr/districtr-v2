'use client';
import {useState} from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import {RECAPTCHA_SITE_KEY} from '../utils/api/constants';
import { Text } from '@radix-ui/themes';

export const useRecaptcha = () => {
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const RecaptchaComponent = RECAPTCHA_SITE_KEY ? (
    <ReCAPTCHA sitekey={RECAPTCHA_SITE_KEY} onChange={value => setRecaptchaToken(value)} />
  ) : <Text color="red">Error: Recaptcha is disabled</Text>;
  return {
    RecaptchaComponent,
    recaptchaToken,
  };
};
