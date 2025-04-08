'use client';
import {LANG_MAPPING} from '@/app/utils/language';
import {Button, Flex} from '@radix-ui/themes';
import {setCookie} from 'cookies-next';
import {useRouter} from 'next/navigation';

export const LanguagePicker: React.FC<{
  preferredLanguage: string;
  availableLanguages: string[];
}> = ({preferredLanguage, availableLanguages}) => {
  const router = useRouter();
  const handleLanguagePreference = async (language: string) => {
    setCookie('language', language);
    router.refresh();
  };
  if (availableLanguages.length === 1 && availableLanguages[0] === preferredLanguage) {
    return null;
  }

  return (
    <Flex direction={'row'} gapX="1" pb="2">
      {availableLanguages.map(language => (
        <Button
          key={language}
          onClick={() => handleLanguagePreference(language)}
          variant={language === preferredLanguage ? 'solid' : 'surface'}
        >
          {language in LANG_MAPPING
            ? LANG_MAPPING[language as keyof typeof LANG_MAPPING]
            : language}
        </Button>
      ))}
      {!availableLanguages.includes(preferredLanguage) && (
        <Button
          onClick={() => handleLanguagePreference(preferredLanguage)}
          variant="ghost"
          disabled
        >
          {preferredLanguage} not available
        </Button>
      )}
    </Flex>
  );
};
