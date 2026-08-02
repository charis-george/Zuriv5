import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import type { BusinessMode } from '../../types'
import { getBusinessToken } from '../../lib/businessAuthStorage'
import { formatUserFacingError } from '../../lib/formatApiError'
import { isGrowthPlusPlan } from '../../lib/planAccess'
import { useDialog } from '../DialogProvider'

export type MenuCatalogPreset = {
  id: string
  name: string
  presetMode: BusinessMode
  displayOrder: number
  isActive: boolean
}

type PresetsPayload = {
  presets: MenuCatalogPreset[]
  activePresetId: string | null
  presetsEnabled: boolean
  presetsHint?: string
}

type Props = {
  businessId: string
  plan?: string
  catalogMode: BusinessMode
  editingPresetId: string | null
  onEditingPresetChange: (presetId: string) => void
  onCatalogChanged: () => void
}

function getAuthHeaders(): { Authorization: string } | Record<string, never> {
  const token = getBusinessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function MenuCatalogPresets({
  businessId,
  plan,
  catalogMode,
  editingPresetId,
  onEditingPresetChange,
  onCatalogChanged,
}: Props): JSX.Element | null {
  const dialog = useDialog()
  const growthPlus = isGrowthPlusPlan(plan)
  const [presets, setPresets] = useState<MenuCatalogPreset[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presetsEnabled, setPresetsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presetsHint, setPresetsHint] = useState<string | null>(null)

  const loadPresets = useCallback(() => {
    if (!businessId || !growthPlus) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    axios
      .get<PresetsPayload>(`/api/menu/presets/${businessId}`, { headers: getAuthHeaders() })
      .then((res) => {
        setPresets(res.data.presets || [])
        setActivePresetId(res.data.activePresetId || null)
        setPresetsEnabled(!!res.data.presetsEnabled)
        setPresetsHint(res.data.presetsHint || null)
        const first = res.data.presets?.[0]?.id
        const nextEdit =
          editingPresetId && res.data.presets?.some((p) => p.id === editingPresetId)
            ? editingPresetId
            : res.data.activePresetId || first || null
        if (nextEdit && nextEdit !== editingPresetId) onEditingPresetChange(nextEdit)
      })
      .catch((err) => {
        setError(
          axios.isAxiosError(err)
            ? formatUserFacingError(err.response?.data, 'Could not load catalog presets.')
            : 'Could not load catalog presets.'
        )
      })
      .finally(() => setLoading(false))
  }, [businessId, growthPlus, onEditingPresetChange])

  useEffect(() => {
    loadPresets()
  }, [loadPresets, catalogMode])

  if (!growthPlus) {
    return (
      <div className="mb-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        <span className="font-semibold text-zuri-black">Catalog presets</span> — save separate menus (e.g. breakfast vs dinner, or
        different vendor locations) and switch which one is live on your QR storefront. Available on{' '}
        <span className="text-zuri-orange font-semibold">Growth and above</span>.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
        Loading catalog presets…
      </div>
    )
  }

  if (!presetsEnabled) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-2">
        <p className="font-semibold text-amber-950">Catalog presets unavailable</p>
        <p>
          {presetsHint ||
            'The API could not read menu_presets. If you already ran migration 016, reload the Supabase schema cache and restart the API.'}
        </p>
        {error && <p className="text-red-700">{error}</p>}
        <button
          type="button"
          onClick={() => loadPresets()}
          className="text-[11px] font-semibold rounded-lg border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100"
        >
          Retry
        </button>
      </div>
    )
  }

  const createPreset = async (): Promise<void> => {
    const name = await dialog.prompt({
      title: 'Create catalog preset',
      message: 'Enter a name for this preset.',
      defaultValue: `Preset ${presets.length + 1}`,
      placeholder: 'e.g. Breakfast menu',
      confirmLabel: 'Create'
    })
    if (!name?.trim()) return
    setBusy(true)
    try {
      await axios.post(
        '/api/menu/presets',
        { businessId, name: name.trim() },
        { headers: getAuthHeaders() }
      )
      loadPresets()
      onCatalogChanged()
    } catch (err) {
      dialog.alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not create preset.')
          : 'Could not create preset.'
      )
    } finally {
      setBusy(false)
    }
  }

  const activatePreset = async (presetId: string): Promise<void> => {
    setBusy(true)
    try {
      await axios.post(
        `/api/menu/presets/${presetId}/activate`,
        { businessId },
        { headers: getAuthHeaders() }
      )
      setActivePresetId(presetId)
      onEditingPresetChange(presetId)
      onCatalogChanged()
      loadPresets()
    } catch (err) {
      dialog.alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not switch live catalog.')
          : 'Could not switch live catalog.'
      )
    } finally {
      setBusy(false)
    }
  }

  const duplicatePreset = async (presetId: string): Promise<void> => {
    setBusy(true)
    try {
      const { data } = await axios.post<{ preset?: MenuCatalogPreset }>(
        `/api/menu/presets/${presetId}/duplicate`,
        { businessId },
        { headers: getAuthHeaders() }
      )
      if (data.preset?.id) onEditingPresetChange(data.preset.id)
      loadPresets()
      onCatalogChanged()
    } catch (err) {
      dialog.alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not duplicate preset.')
          : 'Could not duplicate preset.'
      )
    } finally {
      setBusy(false)
    }
  }

  const renamePreset = async (preset: MenuCatalogPreset): Promise<void> => {
    const name = await dialog.prompt({
      title: 'Rename catalog preset',
      message: 'Update the preset name.',
      defaultValue: preset.name,
      placeholder: 'Preset name',
      confirmLabel: 'Rename'
    })
    if (!name?.trim() || name.trim() === preset.name) return
    setBusy(true)
    try {
      await axios.patch(
        `/api/menu/presets/${preset.id}`,
        { businessId, name: name.trim() },
        { headers: getAuthHeaders() }
      )
      loadPresets()
    } catch (err) {
      dialog.alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not rename preset.')
          : 'Could not rename preset.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-zuri-orange/25 bg-zuri-orange/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-zuri-black">Catalog presets</p>
          <p className="text-xs text-gray-600 mt-0.5 max-w-xl">
            Build separate item lists (e.g. Chapman &amp; donuts for Preset 1, another set for Preset 2). Only the{' '}
            <span className="font-semibold">Live on storefront</span> preset is shown to customers on your QR link.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createPreset()}
          className="shrink-0 rounded-xl bg-zuri-orange text-white text-xs font-semibold px-3 py-2 hover:bg-zuri-orange-dark disabled:opacity-60"
        >
          + New preset
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const isEditing = editingPresetId === preset.id
          const isLive = activePresetId === preset.id
          return (
            <div
              key={preset.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border px-3 py-2 bg-white ${
                isEditing ? 'border-zuri-orange ring-1 ring-zuri-orange/30' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => onEditingPresetChange(preset.id)}
                className="text-left text-sm font-semibold text-zuri-black hover:text-zuri-orange disabled:opacity-60"
              >
                {preset.name}
                {isLive && (
                  <span className="ml-2 inline-flex text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    Live
                  </span>
                )}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {!isLive && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void activatePreset(preset.id)}
                    className="text-[11px] font-semibold rounded-lg border border-zuri-orange text-zuri-orange px-2 py-1 hover:bg-zuri-orange hover:text-white disabled:opacity-60"
                  >
                    Set live
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void duplicatePreset(preset.id)}
                  className="text-[11px] font-semibold rounded-lg border border-gray-200 text-gray-700 px-2 py-1 hover:bg-gray-50 disabled:opacity-60"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void renamePreset(preset)}
                  className="text-[11px] font-semibold rounded-lg border border-gray-200 text-gray-700 px-2 py-1 hover:bg-gray-50 disabled:opacity-60"
                >
                  Rename
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {editingPresetId && editingPresetId !== activePresetId && (
        <p className="text-[11px] text-gray-600 mt-3">
          You are editing a draft preset. Click <span className="font-semibold">Set live</span> when this catalog should appear on your
          customer storefront.
        </p>
      )}
    </div>
  )
}
