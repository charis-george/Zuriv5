/** Payload encoded in ticket preview QRs (pre-purchase confirmation preview). */
export function ticketPreviewQrPayload(businessId: string, ticketTypeId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zuriqo.com'
  return `${origin}/ticket-preview?business=${encodeURIComponent(businessId)}&type=${encodeURIComponent(ticketTypeId)}`
}

export function ticketPreviewQrImageUrl(payload: string, size = 128): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`
}

/** After an order is created, link-style payload for “hold” / payment confirmation screen */
export function ticketOrderHoldQrPayload(businessId: string, orderId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zuriqo.com'
  return `${origin}/ticket-confirmation?business=${encodeURIComponent(businessId)}&order=${encodeURIComponent(orderId)}`
}
