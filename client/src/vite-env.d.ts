/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  PaystackPop?: new () => {
    isLoaded(): boolean
    resumeTransaction(
      accessCode: string,
      callbacks?: {
        onLoad?: (payload: { id: number; customer: object; accessCode: string }) => void
        onSuccess?: (payload: { id: number; reference: string; message: string }) => void
        onCancel?: () => void
        onError?: (payload: { message: string }) => void
      },
    ): unknown
  }
}
