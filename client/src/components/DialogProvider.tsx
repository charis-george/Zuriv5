import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from './ConfirmModal'
import { NoticeModal, type NoticeVariant } from './NoticeModal'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type PromptOptions = {
  title: string
  message: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type DialogApi = {
  alert: (message: string, options?: { title?: string; variant?: NoticeVariant; buttonLabel?: string }) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

type NoticeState = {
  open: boolean
  message: string
  title?: string
  variant?: NoticeVariant
  buttonLabel?: string
}

type ConfirmState = {
  open: boolean
  options: ConfirmOptions | null
}

type PromptState = {
  open: boolean
  options: PromptOptions | null
}

export function DialogProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [notice, setNotice] = useState<NoticeState>({ open: false, message: '' })
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, options: null })
  const [promptState, setPromptState] = useState<PromptState>({ open: false, options: null })
  const [promptValue, setPromptValue] = useState('')

  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null)
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null)

  const openAlert = useCallback<DialogApi['alert']>((message, options) => {
    setNotice({
      open: true,
      message,
      title: options?.title,
      variant: options?.variant,
      buttonLabel: options?.buttonLabel
    })
  }, [])

  const openConfirm = useCallback<DialogApi['confirm']>((options) => {
    setConfirmState({ open: true, options })
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve
    })
  }, [])

  const openPrompt = useCallback<DialogApi['prompt']>((options) => {
    setPromptValue(options.defaultValue ?? '')
    setPromptState({ open: true, options })
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve
    })
  }, [])

  useEffect(() => {
    const originalAlert = window.alert
    window.alert = (message?: unknown) => {
      openAlert(String(message ?? ''))
    }
    return () => {
      window.alert = originalAlert
    }
  }, [openAlert])

  const api = useMemo<DialogApi>(
    () => ({
      alert: openAlert,
      confirm: openConfirm,
      prompt: openPrompt
    }),
    [openAlert, openConfirm, openPrompt]
  )

  return (
    <DialogContext.Provider value={api}>
      {children}

      <NoticeModal
        open={notice.open}
        title={notice.title}
        message={notice.message}
        variant={notice.variant}
        buttonLabel={notice.buttonLabel}
        onClose={() => setNotice({ open: false, message: '' })}
      />

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.options?.title || 'Confirm action'}
        message={confirmState.options?.message || ''}
        confirmLabel={confirmState.options?.confirmLabel}
        cancelLabel={confirmState.options?.cancelLabel}
        danger={confirmState.options?.danger}
        onConfirm={() => {
          confirmResolverRef.current?.(true)
          confirmResolverRef.current = null
          setConfirmState({ open: false, options: null })
        }}
        onCancel={() => {
          confirmResolverRef.current?.(false)
          confirmResolverRef.current = null
          setConfirmState({ open: false, options: null })
        }}
      />

      {promptState.open && promptState.options ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              promptResolverRef.current?.(null)
              promptResolverRef.current = null
              setPromptState({ open: false, options: null })
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-zuri-black mb-2">{promptState.options.title}</h2>
            <p className="text-gray-600 text-sm mb-4">{promptState.options.message}</p>
            <input
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptState.options.placeholder}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-zuri-orange/40"
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                onClick={() => {
                  promptResolverRef.current?.(null)
                  promptResolverRef.current = null
                  setPromptState({ open: false, options: null })
                }}
              >
                {promptState.options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-zuri-orange hover:bg-zuri-orange-dark transition"
                onClick={() => {
                  promptResolverRef.current?.(promptValue)
                  promptResolverRef.current = null
                  setPromptState({ open: false, options: null })
                }}
              >
                {promptState.options.confirmLabel || 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider')
  return ctx
}
