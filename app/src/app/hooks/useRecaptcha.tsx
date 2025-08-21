'use client';
import ReCAPTCHA from 'react-google-recaptcha';
import {RECAPTCHA_SITE_KEY} from '../utils/api/constants';
import {Text} from '@radix-ui/themes';
import {useFormState} from '../store/formState';
import {useEffect, useMemo, useState} from 'react';

const RecaptchaComponent: React.FC<{
  setRecaptchaToken: (token: string) => void;
  recaptchaToken: string;
}> = ({setRecaptchaToken, recaptchaToken}) => {
  const [reset, setReset] = useState(false);

  useEffect(() => { 
    if (!recaptchaToken?.length) {
      setReset(true);
      setTimeout(() => {
        setReset(false);
      }, 100);
    }
  }, [recaptchaToken]);
  if (reset) {
    return null;
  }

  if (!RECAPTCHA_SITE_KEY) {
    return <Text color="red">Error: Recaptcha is disabled</Text>;
  }
  return (
    <ReCAPTCHA
      sitekey={RECAPTCHA_SITE_KEY}
      onChange={value => setRecaptchaToken(value ?? '')}
    />
  );
};

export const useRecaptcha = () => {
  const setRecaptchaToken = useFormState(state => state.setRecaptchaToken);
  const recaptchaToken = useFormState(state => state.recaptchaToken);
  const Component = useMemo(() => {
    return <RecaptchaComponent setRecaptchaToken={setRecaptchaToken} recaptchaToken={recaptchaToken} />;
  }, [setRecaptchaToken, recaptchaToken]);
  return {
    RecaptchaComponent: Component,
    recaptchaToken,
  };
};
