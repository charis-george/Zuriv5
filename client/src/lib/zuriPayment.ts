/**
 * Unified ZURI checkout — routes to Paystack or Monnify based on server initialize response.
 */
import { startZuriPayment as startPaystackPayment, preloadPaystackInline } from './paystackZuri'
import { startMonnifyPayment, preloadMonnifySdk } from './monnifyZuri'

export type PaymentProvider = 'paystack' | 'monnify'

export type ZuriPaymentInitializePayload = {
  provider?: PaymentProvider
  reference: string
  orderId?: string
  // Paystack
  authorizationUrl?: string | null
  accessCode?: string | null
  publicKey?: string | null
  // Monnify
  checkoutUrl?: string | null
  apiKey?: string | null
  contractCode?: string | null
  amount?: number
  customerEmail?: string
  customerName?: string
  isTestMode?: boolean
}

export function preloadZuriPayment(provider?: PaymentProvider): void {
  if (provider === 'monnify') {
    preloadMonnifySdk()
    return
  }
  preloadPaystackInline()
}

export async function startZuriPayment(
  data: ZuriPaymentInitializePayload,
  opts?: {
    successPath?: string
    onCancel?: () => void
    onError?: (message: string) => void
  },
): Promise<void> {
  const provider = data.provider || 'paystack'
  if (provider === 'monnify') {
    return startMonnifyPayment(
      {
        reference: data.reference,
        orderId: data.orderId || data.reference,
        amount: data.amount,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        apiKey: data.apiKey,
        contractCode: data.contractCode,
        checkoutUrl: data.checkoutUrl,
        isTestMode: data.isTestMode,
      },
      opts,
    )
  }

  return startPaystackPayment(
    {
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
      reference: data.reference,
    },
    opts,
  )
}
