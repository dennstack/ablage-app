import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import type { UpdateState } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api, errorMessage, onEvent } from '@/lib/api'

function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    void api['updates:state']().then(setState)
    return onEvent('updates:changed', setState)
  }, [])
  return state
}

function install(): void {
  api['updates:install']().catch((err: unknown) => toast.error(errorMessage(err)))
}

function statusText(u: UpdateState): string | null {
  switch (u.phase) {
    case 'checking':
      return 'Suche nach Updates …'
    case 'current':
      return 'Ablage ist aktuell.'
    case 'available':
      return `Version ${u.version} ist verfügbar.`
    case 'downloading':
      return `Version ${u.version} wird geladen (${u.percent ?? 0} %).`
    case 'ready':
      return `Version ${u.version} ist bereit und wird spätestens beim Beenden installiert.`
    case 'error':
      return `Update fehlgeschlagen: ${u.error}`
    default:
      return null
  }
}

export function AutoUpdateSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <Label>Automatische Updates</Label>
        <p className="text-xs text-muted-foreground">
          Fragt GitHub alle 6 Stunden nach einer neuen Version und lädt sie herunter. Dokumente werden dabei nicht übertragen.
        </p>
      </div>
      <Switch aria-label="Automatische Updates" checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function UpdatesCard({ autoUpdate, onAutoUpdate }: { autoUpdate: boolean; onAutoUpdate: (v: boolean) => void }) {
  const state = useUpdateState()
  if (!state) return null

  const run = (fn: () => Promise<unknown>) => (): void => {
    fn().catch((err: unknown) => toast.error(errorMessage(err)))
  }

  if (!state.supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>Diese Version aktualisiert sich nicht selbst und nimmt dafür keinen Kontakt zu GitHub auf.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={run(() => api['updates:openDownloads']())}>
            <ExternalLink /> Download-Seite öffnen
          </Button>
        </CardContent>
      </Card>
    )
  }

  const text = statusText(state)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AutoUpdateSwitch checked={autoUpdate} onChange={onAutoUpdate} />
        <div className="flex items-center gap-2">
          {state.phase === 'ready' ? (
            <Button onClick={install}>
              <RotateCw /> Jetzt neu starten
            </Button>
          ) : state.phase === 'available' ? (
            <Button onClick={run(() => api['updates:download']())}>
              <Download /> Herunterladen
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={state.phase === 'checking' || state.phase === 'downloading'}
              onClick={run(() => api['updates:check']())}
            >
              <RefreshCw /> Jetzt prüfen
            </Button>
          )}
        </div>
        {text && <p className={state.phase === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{text}</p>}
      </CardContent>
    </Card>
  )
}

export function UpdateReadyButton() {
  const state = useUpdateState()
  if (state?.phase !== 'ready') return null
  return (
    <Button variant="outline" className="mt-2 w-full justify-start" title={`Version ${state.version} installieren`} onClick={install}>
      <RotateCw /> Update installieren
    </Button>
  )
}
