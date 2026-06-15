import {useCallback} from 'react';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {MAP_MODES} from '@constants/map/mode';

export const useSelectCommunity = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const communities = useMapStore(state => state.communities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const setCommunityVisibilityForCommunities = useCoiAssignmentsStore(
    state => state.setCommunityVisibilityForCommunities
  );

  return useCallback(
    (communityId: number) => {
      if (mapMode !== MAP_MODES.COI) {
        setSelectedZone(communityId);
        return;
      }

      if (!communities.some(community => community.id === communityId)) {
        return;
      }

      const nonSelectedCommunityIds = communities
        .map(community => community.id)
        .filter(id => id !== selectedZone);
      const anyNotSelectedVisible = nonSelectedCommunityIds.some(
        id => communityVisibility.get(id) ?? true
      );

      if (!anyNotSelectedVisible && communityId !== selectedZone) {
        const communitiesToHide = communities
          .map(community => community.id)
          .filter(id => id !== communityId);
        setCommunityVisibilityForCommunities(communitiesToHide, false);
      }

      setSelectedZone(communityId);
      setCommunityVisibility(communityId, true);
    },
    [
      communities,
      communityVisibility,
      mapMode,
      selectedZone,
      setCommunityVisibility,
      setCommunityVisibilityForCommunities,
      setSelectedZone,
    ]
  );
};
