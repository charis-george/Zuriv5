/** Browser tab & share preview titles for storefront and event pages. */

export function formatZuriStorefrontTitle(storefrontName: string): string {
  const label = storefrontName.trim() || 'Storefront'
  return `ZURI | ${label}`
}

export function formatZuriEventTitle(eventTitle: string, businessName: string): string {
  const event = eventTitle.trim() || 'Event'
  const business = businessName.trim() || 'Venue'
  return `Buy ${event} by ${business} on Zuri`
}
