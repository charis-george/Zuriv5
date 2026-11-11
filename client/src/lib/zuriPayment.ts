/**
 * Unified ZURI checkout — Paystack only.
 */
import { startZuriPayment as startPaystackPayment, preloadPaystackInline } from './paystackZuri'

export type PaymentProvider = 'paystack'

export type ZuriPaymentInitializePayload = {
  provider?: PaymentProvider | string
  reference: string
  orderId?: string
  authorizationUrl?: string | null
  accessCode?: string | null
  publicKey?: string | null
  checkoutUrl?: string | null
  apiKey?: string | null
  contractCode?: string | null
  amount?: number
  customerEmail?: string
  customerName?: string
  isTestMode?: boolean
}

export function preloadZuriPayment(_provider?: PaymentProvider | string): void {
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
  return startPaystackPayment(
    {
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
      reference: data.reference,
    },
    opts,
  )
}
