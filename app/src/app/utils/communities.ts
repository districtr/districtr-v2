import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';
import {type NullableZone, type Zone} from '@constants/map/zone';
import {Community} from '@/app/utils/api/apiHandlers/types';
import {extendColorArray} from '@/app/utils/colors';
import type {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {US_STATE_META} from '@/app/constants/meta/usStates';

const fallbackCreatedAt = (index: number) => new Date(index * 1000).toISOString();
const communityNameForIndex = (index: number) => `Community ${index + 1}`;
export const DEFAULT_COMMUNITY_DESCRIPTION = 'No description provided';

const compareCommunitiesByRenderOrder = (left: Community, right: Community) => {
  const leftOrder = left.render_order_id ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.render_order_id ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.id - right.id;
};

const parseCommunityNameIndex = (name: string) => {
  const match = /^Community (\d+)$/.exec(name.trim());
  if (!match) return null;
  return Number(match[1]);
};

const isDefaultCommunityName = (name: string) => parseCommunityNameIndex(name) !== null;

export const sortCommunitiesByRenderOrder = (communities?: Community[] | null) =>
  [...(communities ?? [])].sort(compareCommunitiesByRenderOrder);

export const normalizeCommunities = ({
  communities,
  count,
  colorScheme,
}: {
  communities?: Community[] | null;
  count: number;
  colorScheme?: string[] | null;
}): Community[] => {
  const palette = colorScheme?.length ? colorScheme : DefaultColorScheme;
  const communitiesWithFallbackOrder = [...(communities ?? [])].map((community, index) => ({
    ...community,
    render_order_id: community.render_order_id ?? index + 1,
  }));
  const normalized = sortCommunitiesByRenderOrder(communitiesWithFallbackOrder)
    .slice(0, count)
    .map((community, index) => ({
      id: community.id,
      render_order_id: index + 1,
      name:
        !community.name || isDefaultCommunityName(community.name)
          ? communityNameForIndex(index)
          : community.name,
      description: community.description || DEFAULT_COMMUNITY_DESCRIPTION,
      color: community.color || palette[(community.id - 1) % palette.length] || '#000000',
      createdAt: community.createdAt || fallbackCreatedAt(index),
      descriptionCommentId: community.descriptionCommentId ?? null,
    }));

  for (let index = normalized.length; index < count; index += 1) {
    const nextId = getNextCommunityId(normalized);
    normalized.push({
      id: nextId,
      render_order_id: index + 1,
      name: getNextCommunityName(normalized),
      description: DEFAULT_COMMUNITY_DESCRIPTION,
      color: getNextUnusedCommunityColor(normalized, palette),
      createdAt: new Date().toISOString(),
      descriptionCommentId: null,
    });
  }

  return normalized;
};

export const getCommunityColor = (
  communities: Community[],
  zone: NullableZone,
  fallbackColor = '#000000'
) => {
  if (zone === null) return fallbackColor;
  return communities.find(community => community.id === zone)?.color ?? fallbackColor;
};

export const getCommunityById = (communities: Community[], zone: NullableZone) => {
  if (zone === null) return null;
  return communities.find(community => community.id === zone) ?? null;
};

export const getCommunityByRenderOrder = (
  communities: Community[],
  renderOrderId: NullableZone
) => {
  if (renderOrderId === null) return null;
  return communities.find(community => community.render_order_id === renderOrderId) ?? null;
};

export const getCommunityRenderOrderId = (communities: Community[], zone: NullableZone) =>
  getCommunityById(communities, zone)?.render_order_id ?? null;

export const getCommunityDisplayNumber = (communities: Community[], zone: NullableZone) =>
  getCommunityRenderOrderId(communities, zone) ?? zone;

export const getCommunityFeatureStateKey = (zone: NullableZone) => {
  if (zone === null) return null;
  return `community_${zone}`;
};

export const syncCoiColorsToColorScheme = (communities: Community[], colorScheme: string[]) => {
  const nextColorScheme = [...colorScheme];
  communities.forEach(community => {
    nextColorScheme[community.id - 1] = community.color;
  });
  return nextColorScheme;
};

export const getNextCommunityName = (communities: Community[]) =>
  `Community ${communities.length + 1}`;

export const getNextCommunityId = (communities: Community[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.id), 0) + 1;

export const getHighestCommunityId = (communities: Community[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.id), 0);

export const getHighestCommunityRenderOrderId = (communities: Community[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.render_order_id), 0);

export const getNextUnusedCommunityColor = (
  communities: Community[],
  colorScheme?: string[] | null
) => {
  const usedColors = new Set(communities.map(community => community.color));
  let palette = [
    ...(colorScheme?.length ? colorScheme : DefaultColorScheme),
    ...DefaultColorScheme,
  ];
  let nextColor = palette.find(color => !usedColors.has(color));

  while (!nextColor) {
    palette = extendColorArray(palette, palette.length + 1, DefaultColorScheme);
    nextColor = palette.find(color => !usedColors.has(color));
  }

  return nextColor;
};

export const getUnusedCommunityColors = (
  communities: Community[],
  colorScheme?: string[] | null,
  minimumCount = 18
) => {
  const usedColors = new Set(communities.map(community => community.color));
  let palette = [
    ...(colorScheme?.length ? colorScheme : DefaultColorScheme),
    ...DefaultColorScheme,
  ].filter((color, index, colors) => colors.indexOf(color) === index);
  let unusedColors = palette.filter(color => !usedColors.has(color));

  while (unusedColors.length < minimumCount) {
    palette = extendColorArray(palette, palette.length + minimumCount, DefaultColorScheme);
    unusedColors = palette.filter(
      (color, index, colors) => !usedColors.has(color) && colors.indexOf(color) === index
    );
  }

  return unusedColors;
};

export const removeCommunityAndShiftRenderOrder = (
  communities: Community[],
  removedCommunityId: Zone
) =>
  sortCommunitiesByRenderOrder(
    communities.filter(community => community.id !== removedCommunityId)
  ).map((community, index) => ({
    ...community,
    render_order_id: index + 1,
    name: isDefaultCommunityName(community.name) ? communityNameForIndex(index) : community.name,
  }));

export const compareCoiZonesByRenderOrder = (
  left: NullableZone,
  right: NullableZone,
  communities: Community[]
) => {
  const leftOrder = getCommunityRenderOrderId(communities, left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = getCommunityRenderOrderId(communities, right) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
};

export const getPrimaryCommunityId = (
  communities: Iterable<Zone>,
  communityMetadata: Community[]
): NullableZone => {
  let primary: NullableZone = null;
  for (const communityId of communities) {
    if (
      primary === null ||
      compareCoiZonesByRenderOrder(primary, communityId, communityMetadata) < 0
    ) {
      primary = communityId;
    }
  }
  return primary;
};

/**
 * Sanitizes a community module name to just be the state.
 *
 * @param _moduleName string
 * @returns string
 */
export const sanitizeCommunityModuleName: (
  _moduleName: string | null | undefined
) => string | null | undefined = _moduleName => {
  if (!_moduleName) return _moduleName;
  const moduleName = _moduleName.toLocaleLowerCase();
  const stateMatch = US_STATE_META.find(({NAME, ABBR}) => {
    if (moduleName.includes(NAME.toLocaleLowerCase())) return true;
    const abbr = ABBR.toLocaleLowerCase();
    const abbrPattern = new RegExp(`(^|\\s)${abbr}(\\s|$)`);
    return abbrPattern.test(moduleName);
  });
  return stateMatch ? stateMatch.NAME : moduleName;
};
/**
 * Sanitizes a list of maps for community mode.
 * This function filters uniqueness based on the gerrydb table and then
 * sanitizes the map name to just be the state.
 *
 * @param maps DistrictrMaps
 * @returns DistrictrMap[]
 */
export const sanitizeCommunityMaps: (maps: Partial<DistrictrMap>[]) => DistrictrMap[] = maps => {
  const sanitizedMaps: DistrictrMap[] = [];
  const mapNameSet = new Set<string>();
  maps.forEach(map => {
    if (!map.name) return;
    const sanitizedName = sanitizeCommunityModuleName(map.name);
    if (sanitizedName && !mapNameSet.has(sanitizedName)) {
      sanitizedMaps.push({
        ...map,
        name: sanitizedName,
      } as DistrictrMap);
      mapNameSet.add(sanitizedName);
    }
  });
  return sanitizedMaps;
};
