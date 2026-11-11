export type GuestItemSignalKind = 'reorder' | 'for_you' | 'trending' | 'cross_venue' | 'pairs' | 'rnr'

export type GuestItemSignal = {
  kind: GuestItemSignalKind
  label: string
}

export type CrossVenuePick = {
  menuItemId: string
  matchType: 'exact' | 'similar' | 'taste_profile'
  sourceItemName: string
  sourceBusinessName: string
  label: string
}

export type GuestPersonalizationRnrMeta = {
  enabled: boolean
  reinforced?: boolean
  matchSimilarity?: number
  patternCount?: number
}

export type GuestPersonalizationInsights = {
  trendingItemIds: string[]
  upsellSeedIds: string[]
  forYouItemIds: string[]
  reorderItemIds: string[]
  crossVenuePicks: CrossVenuePick[]
  itemSignals: Record<string, GuestItemSignal>
  personalisationActive?: boolean
  crossVenueOptIn?: boolean
  /** Taste-pattern memory (RNR): reinforced when current session matches a prior uncertain visit */
  guestRnr?: GuestPersonalizationRnrMeta
}

export const EMPTY_GUEST_INSIGHTS: GuestPersonalizationInsights = {
  trendingItemIds: [],
  upsellSeedIds: [],
  forYouItemIds: [],
  reorderItemIds: [],
  crossVenuePicks: [],
  itemSignals: {}
}
