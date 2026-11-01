import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FolderOpen, RefreshCw } from 'lucide-react'
import type { OllamaStatus, Settings as SettingsT } from '@shared/types'
import { PageHeader } from '@/components/AppShell'
import { ModelTest, OllamaHelp, OllamaStatusLine } from '@/components/OllamaCheck'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api, errorMessage } from '@/lib/api'
import { invalidateCategories } from '@/lib/hooks'

export function Settings() {
  const [s, setS] = useState<SettingsT | null>(null)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    void api['settings:get']().then(setS)
  }, [])

  if (!s) return null

  const save = async (patch: Partial<SettingsT>): Promise<void> => {
    try {
      setS(await api['settings:update'](patch))
      toast.success('Einstellungen gespeichert')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setOllama(await api['settings:testOllama']())
    setTesting(false)
  }

  const pickLibrary = async (): Promise<void> => {
    try {
      const path = await api['settings:pickLibrary']()
      if (path) {
        setS(await api['settings:get']())
        toast.success('Bibliothek gewechselt', { description: path })
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const rebuild = async (): Promise<void> => {
    if (!confirm('Datenbank aus dem Bibliotheksordner neu aufbauen? Lokale Änderungen ohne Sidecar gehen verloren.')) return
    try {
      const r = await api['library:rebuild']()
      toast.success(`${r.restored} Dokumente eingelesen`, {
        description: r.missing ? `${r.missing} Dateien fehlen` : r.errors.length ? r.errors.slice(0, 3).join('\n') : undefined
      })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="max-w-3xl space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle>Bibliothek</CardTitle>
            <CardDescription>Ordner mit allen Dokumenten. Lokal oder Netzwerkpfad (z. B. \\nas\ablage).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={s.libraryPath ?? ''} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => void pickLibrary()}>
                Ändern
              </Button>
              <Button variant="outline" size="icon" title="Im Explorer öffnen" onClick={() => void api['settings:openLibrary']()}>
                <FolderOpen />
              </Button>
            </div>
            <TextSetting
              label="Ablagestruktur"
              hint="Platzhalter: {category} {year} {month} {date} {sender} {title} {id}"
              value={s.pathTemplate}
              onSave={(v) => save({ pathTemplate: v })}
              mono
            />
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Eingang überwachen</Label>
                <p className="text-xs text-muted-foreground">Dateien im Ordner „Eingang“ werden automatisch importiert.</p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={2}
                  className="w-20"
                  defaultValue={s.inboxPollSeconds}
                  onBlur={(e) => Number(e.target.value) !== s.inboxPollSeconds && void save({ inboxPollSeconds: Number(e.target.value) })}
                  title="Intervall in Sekunden"
                />
                <Switch checked={s.watchInbox} onCheckedChange={(v) => void save({ watchInbox: v })} />
              </div>
            </div>
            <Button variant="outline" onClick={() => void rebuild()}>
              <RefreshCw /> Bibliothek neu einlesen
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ollama</CardTitle>
            <CardDescription>Klassifikation und Texterkennung für Scans.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Klassifikation</Label>
              <Select value={s.classifierMode} onValueChange={(v) => void save({ classifierMode: v as SettingsT['classifierMode'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (Fallback: Regeln)</SelectItem>
                  <SelectItem value="rules">Nur Regeln (Stichwörter)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TextSetting label="URL" value={s.ollamaUrl} onSave={(v) => save({ ollamaUrl: v })} mono />
            <div className="grid grid-cols-2 gap-4">
              <TextSetting label="Textmodell" value={s.ollamaModel} onSave={(v) => save({ ollamaModel: v })} options={ollama?.models} />
              <TextSetting
                label="Vision-Modell (OCR)"
                value={s.ollamaVisionModel}
                onSave={(v) => save({ ollamaVisionModel: v })}
                options={ollama?.models}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={testing} onClick={() => void test()}>
                Verbindung testen
              </Button>
              {ollama && <OllamaStatusLine status={ollama} />}
            </div>
            {ollama && <OllamaHelp status={ollama} />}
            <ModelTest />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Darstellung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>Farbschema</Label>
              <Select value={s.theme} onValueChange={(v) => void save({ theme: v as SettingsT['theme'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Wie System</SelectItem>
                  <SelectItem value="light">Hell</SelectItem>
                  <SelectItem value="dark">Dunkel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kategorien</CardTitle>
            <CardDescription>Werden in categories.yaml gespeichert (eine Ebene Unterkategorien).</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => void navigate('/settings/categories')}>Kategorien bearbeiten</Button>
            <Button variant="outline" onClick={() => void api['categories:openFile']()}>
              Datei bearbeiten
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                invalidateCategories().then(
                  () => toast.success('Kategorien neu geladen'),
                  (err: unknown) => toast.error(errorMessage(err))
                )
              }}
            >
              Neu laden
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function TextSetting(props: { label: string; value: string; onSave: (v: string) => void; hint?: string; mono?: boolean; options?: string[] }) {
  const [v, setV] = useState(props.value)
  useEffect(() => setV(props.value), [props.value])
  const listId = props.options ? `list-${props.label}` : undefined
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <Input
        value={v}
        list={listId}
        className={props.mono ? 'font-mono text-xs' : undefined}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== props.value && props.onSave(v)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {props.options && (
        <datalist id={listId}>
          {props.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  )
}
