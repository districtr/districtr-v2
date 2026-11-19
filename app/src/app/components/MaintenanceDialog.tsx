'use client';
import {usePathname} from 'next/navigation';
import {Dialog, Text} from '@radix-ui/themes';
import {useSiteSettings} from '../utils/api/siteSettings';

/**
 * Blocks the page while maintenance mode is on: the API is answering 503, so
 * edits can't save. Runs on the shared site-settings poll (load, tab return,
 * window focus, every minute) and closes on the first check after
 * maintenance ends. Like VersionCheck's dialog it has no dismiss affordance.
 * Skipped on /under-construction, which already says the same thing.
 */
export const MaintenanceDialog = () => {
  const settings = useSiteSettings();
  const pathname = usePathname();
  if (!settings?.under_construction || pathname === '/under-construction') return null;

  return (
    <Dialog.Root open>
      <Dialog.Content>
        <Dialog.Title>Districtr is down for maintenance</Dialog.Title>
        <Dialog.Description size="3" className="block mb-4">
          Changes can&apos;t be saved right now. This message closes on its own once Districtr is
          back.
        </Dialog.Description>
        {settings.banner_message && (
          <Text size="3" weight="bold" className="block whitespace-pre-line">
            {settings.banner_message}
          </Text>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};
