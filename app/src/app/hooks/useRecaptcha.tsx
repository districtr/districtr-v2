import {useState} from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import {RECAPTCHA_SITE_KEY} from '../utils/api/constants';

export const useRecaptcha = () => {
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const RecaptchaComponent = (
    <ReCAPTCHA sitekey={RECAPTCHA_SITE_KEY} onChange={value => setRecaptchaToken(value)} />
  );
  return {
    RecaptchaComponent,
    recaptchaToken,
  };
};
