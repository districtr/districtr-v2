import {useEffect} from 'react';
import {useFeatureFlagStore} from '../store/featureFlagStore';

export const useFeatureFlags = () => {
  const store = useFeatureFlagStore();

  useEffect(() => {
    store.getFlags();
  }, [store.getFlags]);

  return store;
};
