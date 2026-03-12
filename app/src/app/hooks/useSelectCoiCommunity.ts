import {useCallback} from 'react';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';

export const useSelectCoiCommunity = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const coiCommunities = useMapStore(state => state.coiCommunities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const setCommunityVisibilityForCommunities = useCoiAssignmentsStore(
    state => state.setCommunityVisibilityForCommunities
  );

  return useCallback(
    (communityId: number) => {
      if (mapMode !== 'coi') {
        setSelectedZone(communityId);
        return;
      }

      if (!coiCommunities.some(community => community.id === communityId)) {
        return;
      }

      const nonSelectedCommunityIds = coiCommunities
        .map(community => community.id)
        .filter(id => id !== selectedZone);
      const anyNotSelectedVisible = nonSelectedCommunityIds.some(
        id => communityVisibility.get(id) ?? true
      );

      if (!anyNotSelectedVisible && communityId !== selectedZone) {
        const communitiesToHide = coiCommunities
          .map(community => community.id)
          .filter(id => id !== communityId);
        setCommunityVisibilityForCommunities(communitiesToHide, false);
      }

      setSelectedZone(communityId);
      setCommunityVisibility(communityId, true);
    },
    [
      coiCommunities,
      communityVisibility,
      mapMode,
      selectedZone,
      setCommunityVisibility,
      setCommunityVisibilityForCommunities,
      setSelectedZone,
    ]
  );
};
