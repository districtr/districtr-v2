import {useEffect} from 'react';
import {useFeatureFlagStore} from '../store/featureFlagStore';

/** The /api/env settings (feedback form URL, debug points). For the
 * CMS-toggled features, see useFeatureFlag in store/featureFlagStore. */
export const useFeatureFlags = () => {
  const store = useFeatureFlagStore();

  useEffect(() => {
    store.getFlags();
  }, [store.getFlags]);

  return store;
};
