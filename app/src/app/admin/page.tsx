'use client';
import {useEffect, useState} from 'react';
import {Switch, Text} from '@radix-ui/themes';
import {pages} from './config';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {getSiteSettings, updateSiteSettings} from '@/app/utils/api/cms';

function UnderConstructionToggle() {
  const {session} = useCmsFormStore();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSiteSettings({}).then(r => r.ok && setEnabled(r.response.under_construction));
  }, []);

  const handleToggle = async (checked: boolean) => {
    setError('');
    setEnabled(checked);
    const r = await updateSiteSettings({
      body: {under_construction: checked},
      session: session ?? undefined,
    });
    if (r.ok) {
      setEnabled(r.response.under_construction);
    } else {
      setEnabled(!checked);
      setError(`Could not update: ${r.error.detail}`);
    }
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium text-gray-900">Under Construction Mode</h3>
        <p className="mt-2 text-sm text-gray-500">
          When on, all public traffic is redirected to an under construction page. Admin pages stay
          accessible. Takes up to a minute to apply.
        </p>
        <label className="mt-4 inline-flex items-center gap-2">
          <Switch checked={!!enabled} disabled={enabled === null} onCheckedChange={handleToggle} />
          <Text size="2">{enabled === null ? 'Loading…' : enabled ? 'On' : 'Off'}</Text>
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Districtr Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage your Districtr application content and settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <UnderConstructionToggle />
        {pages.map(page => (
          <div key={page.title} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">{page.title}</h3>
              <p className="mt-2 text-sm text-gray-500">{page.description}</p>
              <a
                href={page.href}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {page.cta}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
