/** Monnify checkout — server init-transaction then redirect to hosted checkoutUrl. */

import { stashPendingPayment, type PendingPaymentKind } from './paymentReferenceStorage'



export type MonnifyInitializePayload = {

  reference: string

  orderId?: string

  amount?: number

  customerEmail?: string

  customerName?: string

  apiKey?: string

  contractCode?: string

  checkoutUrl?: string | null

  isTestMode?: boolean

}



function paymentKindFromSuccessPath(successPath: string): PendingPaymentKind {

  return successPath.includes('upgrade-done') ? 'subscription' : 'order'

}



/** Warm Monnify — no SDK needed when using server checkoutUrl redirect. */

export function preloadMonnifySdk(): void {

  /* no-op: hosted checkoutUrl flow */

}



export async function startMonnifyPayment(

  data: MonnifyInitializePayload,

  opts?: {

    successPath?: string

    onCancel?: () => void

    onError?: (message: string) => void

  },

): Promise<void> {

  const orderId = String(data.orderId || data.reference || '').trim()

  if (!orderId) {

    opts?.onError?.('Could not start payment (missing order reference)')

    return

  }



  const successPath =

    opts?.successPath ??

    `${window.location.origin}/payment-done?reference=${encodeURIComponent(orderId)}`



  stashPendingPayment(orderId, paymentKindFromSuccessPath(successPath))



  if (!data.checkoutUrl) {

    opts?.onError?.('Monnify checkout URL missing. Check server Monnify credentials and redeploy.')

    return

  }



  // Monnify docs: after server init-transaction, open checkoutUrl (do not re-call SDK.initialize).

  window.location.href = data.checkoutUrl

}


