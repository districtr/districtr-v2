import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';
import {NullableZone, Zone} from '@/app/constants/types';
import {CoiCommunity} from '@/app/utils/api/apiHandlers/types';
import {extendColorArray} from '@/app/utils/colors';

const fallbackCreatedAt = (index: number) => new Date(index * 1000).toISOString();
const communityNameForIndex = (index: number) => `Community ${index + 1}`;

const compareCommunitiesByRenderOrder = (left: CoiCommunity, right: CoiCommunity) => {
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

export const sortCoiCommunitiesByRenderOrder = (communities: CoiCommunity[]) =>
  [...communities].sort(compareCommunitiesByRenderOrder);

export const normalizeCoiCommunities = ({
  communities,
  count,
  colorScheme,
}: {
  communities?: CoiCommunity[] | null;
  count: number;
  colorScheme?: string[] | null;
}): CoiCommunity[] => {
  const palette = colorScheme?.length ? colorScheme : DefaultColorScheme;
  const communitiesWithFallbackOrder = [...(communities ?? [])].map((community, index) => ({
    ...community,
    render_order_id: community.render_order_id ?? index + 1,
  }));
  const normalized = sortCoiCommunitiesByRenderOrder(communitiesWithFallbackOrder)
    .slice(0, count)
    .map((community, index) => ({
      id: community.id,
      render_order_id: index + 1,
      name: community.name || communityNameForIndex(index),
      color: community.color || palette[(community.id - 1) % palette.length] || '#000000',
      createdAt: community.createdAt || fallbackCreatedAt(index),
    }));

  for (let index = normalized.length; index < count; index += 1) {
    const nextId = getNextCoiCommunityId(normalized);
    normalized.push({
      id: nextId,
      render_order_id: index + 1,
      name: getNextCoiCommunityName(normalized),
      color: getNextUnusedCoiCommunityColor(normalized, palette),
      createdAt: new Date().toISOString(),
    });
  }

  return normalized;
};

export const getCoiCommunityColor = (
  communities: CoiCommunity[],
  zone: NullableZone,
  fallbackColor = '#000000'
) => {
  if (zone === null) return fallbackColor;
  return communities.find(community => community.id === zone)?.color ?? fallbackColor;
};

export const getCoiCommunityById = (communities: CoiCommunity[], zone: NullableZone) => {
  if (zone === null) return null;
  return communities.find(community => community.id === zone) ?? null;
};

export const getCoiCommunityByRenderOrder = (
  communities: CoiCommunity[],
  renderOrderId: NullableZone
) => {
  if (renderOrderId === null) return null;
  return communities.find(community => community.render_order_id === renderOrderId) ?? null;
};

export const getCoiCommunityRenderOrderId = (communities: CoiCommunity[], zone: NullableZone) =>
  getCoiCommunityById(communities, zone)?.render_order_id ?? null;

export const getCoiCommunityDisplayNumber = (communities: CoiCommunity[], zone: NullableZone) =>
  getCoiCommunityRenderOrderId(communities, zone) ?? zone;

export const getCoiCommunityFeatureStateKey = (zone: NullableZone) => {
  if (zone === null) return null;
  return `community_${zone}`;
};

export const syncCoiColorsToColorScheme = (communities: CoiCommunity[], colorScheme: string[]) => {
  const nextColorScheme = [...colorScheme];
  communities.forEach(community => {
    nextColorScheme[community.id - 1] = community.color;
  });
  return nextColorScheme;
};

export const getNextCoiCommunityName = (communities: CoiCommunity[]) => {
  const usedNames = new Set(
    communities
      .map(community => parseCommunityNameIndex(community.name))
      .filter((index): index is number => index !== null)
  );
  let nextIndex = 1;
  while (usedNames.has(nextIndex)) {
    nextIndex += 1;
  }
  return `Community ${nextIndex}`;
};

export const getNextCoiCommunityId = (communities: CoiCommunity[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.id), 0) + 1;

export const getHighestCoiCommunityId = (communities: CoiCommunity[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.id), 0);

export const getHighestCoiCommunityRenderOrderId = (communities: CoiCommunity[]) =>
  communities.reduce((maxValue, community) => Math.max(maxValue, community.render_order_id), 0);

export const getNextUnusedCoiCommunityColor = (
  communities: CoiCommunity[],
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

export const removeCoiCommunityAndShiftRenderOrder = (
  communities: CoiCommunity[],
  removedCommunityId: Zone
) =>
  sortCoiCommunitiesByRenderOrder(
    communities.filter(community => community.id !== removedCommunityId)
  ).map((community, index) => ({
    ...community,
    render_order_id: index + 1,
  }));

export const compareCoiZonesByRenderOrder = (
  left: NullableZone,
  right: NullableZone,
  communities: CoiCommunity[]
) => {
  const leftOrder = getCoiCommunityRenderOrderId(communities, left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = getCoiCommunityRenderOrderId(communities, right) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
};

export const getPrimaryCoiCommunityId = (
  communities: Iterable<Zone>,
  communityMetadata: CoiCommunity[]
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
