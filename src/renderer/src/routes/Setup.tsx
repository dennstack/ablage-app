import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Archive, Bot, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import type { OllamaStatus, Settings } from '@shared/types'
import { ModelTest, OllamaHelp, OllamaStatusLine } from '@/components/OllamaCheck'
import { Button } from '@/components/ui/button'
import { AutoUpdateSwitch } from '@/components/Updates'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'

export function Setup({ initial, onDone }: { initial: Settings; onDone: () => void }) {
  const [step, setStep] = useState<'library' | 'ollama'>(initial.libraryPath ? 'ollama' : 'library')

  const pick = async (): Promise<void> => {
    try {
      if (await api['settings:pickLibrary']()) setStep('ollama')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const finish = async (patch: Partial<Settings> = {}): Promise<void> => {
    try {
      await api['settings:update']({ ...patch, setupCompleted: true })
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-muted/40 p-8">
      {step === 'library' ? (
        <Card className="max-w-lg">
          <CardHeader>
            <Archive className="mb-2 size-8 text-primary" />
            <CardTitle className="text-xl">Willkommen bei Ablage</CardTitle>
            <CardDescription>
              Wähle einen Ordner für deine Dokumente. Ablage legt darin „Eingang“, „Dokumente“ und „.ablage“ an und verwaltet die
              Dateien selbst. Ein bestehender Ablage-Ordner wird automatisch eingelesen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" onClick={() => void pick()}>
              <FolderOpen /> Bibliotheksordner wählen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <OllamaStep initial={initial} onFinish={finish} />
      )}
    </div>
  )
}

function OllamaStep({ initial, onFinish }: { initial: Settings; onFinish: (patch?: Partial<Settings>) => Promise<void> }) {
  const [url, setUrl] = useState(initial.ollamaUrl)
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [updatesSupported, setUpdatesSupported] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(false)

  const check = useCallback(async (u: string): Promise<void> => {
    setChecking(true)
    try {
      await api['settings:update']({ ollamaUrl: u })
      setStatus(await api['settings:testOllama']())
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check(initial.ollamaUrl)
  }, [check, initial.ollamaUrl])

  useEffect(() => {
    void api['updates:state']().then((u) => setUpdatesSupported(u.supported))
  }, [])

  const ready = status?.reachable && status.missingModels.length === 0

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <Bot className="mb-2 size-8 text-primary" />
        <CardTitle className="text-xl">KI-Klassifikation mit Ollama</CardTitle>
        <CardDescription>
          Ablage nutzt Ollama, um Dokumente lokal zu kategorisieren und Scans zu lesen. Benötigt werden das Textmodell{' '}
          <code>{initial.ollamaModel}</code> und das Vision-Modell <code>{initial.ollamaVisionModel}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Ollama-URL</Label>
          <div className="flex gap-2">
            <Input
              value={url}
              className="font-mono text-xs"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void check(url)}
            />
            <Button variant="outline" disabled={checking} onClick={() => void check(url)}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Prüfen
            </Button>
          </div>
        </div>
        {status && <OllamaStatusLine status={status} />}
        {status && <OllamaHelp status={status} />}
        {ready && <ModelTest />}
        {updatesSupported && <AutoUpdateSwitch checked={autoUpdate} onChange={setAutoUpdate} />}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="ghost" onClick={() => void onFinish({ classifierMode: 'rules', autoUpdate })}>
          Ohne Ollama fortfahren
        </Button>
        <Button disabled={!ready} onClick={() => void onFinish({ classifierMode: 'ollama', autoUpdate })}>
          Fertig
        </Button>
      </CardFooter>
    </Card>
  )
}
