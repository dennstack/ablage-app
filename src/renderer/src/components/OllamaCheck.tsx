import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, Download, FlaskConical, Loader2, XCircle } from 'lucide-react'
import type { ModelCheck, ModelTestResult, OllamaStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { installCommand, renderSamplePng } from '@/lib/ollama'

function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
      <code className="flex-1 font-mono text-xs">{cmd}</code>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        title="Kopieren"
        onClick={() => void navigator.clipboard.writeText(cmd).then(() => toast.success('Kopiert'))}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  )
}

export function OllamaStatusLine({ status }: { status: OllamaStatus }) {
  if (!status.reachable) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-destructive">
        <XCircle className="size-4 shrink-0" /> {status.error}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
      <CheckCircle2 className="size-4 shrink-0" /> Erreichbar ({status.latency_ms} ms, {status.models.length} Modelle)
    </span>
  )
}

/** Explains what is missing (install, start, pull models) for the given status. */
export function OllamaHelp({ status }: { status: OllamaStatus }) {
  if (status.reachable && status.missingModels.length === 0) return null

  const install = installCommand(status.platform)
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      {!status.reachable && status.installed === false && (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Ollama ist auf diesem Rechner nicht installiert.
          </p>
          <p className="text-muted-foreground">
            Ollama führt die KI-Modelle lokal aus. Ohne Ollama werden Dokumente nur per Stichwortregeln einsortiert und gescannte
            PDFs/Bilder nicht per Texterkennung gelesen.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void api['settings:openOllamaDownload']()}>
              <Download /> Ollama herunterladen
            </Button>
            <span className="text-xs text-muted-foreground">oder im Terminal:</span>
          </div>
          {install && <Command cmd={install} />}
          <p className="text-xs text-muted-foreground">Nach der Installation startet Ollama automatisch. Danach erneut prüfen.</p>
        </>
      )}
      {!status.reachable && status.installed === true && (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Ollama ist installiert, läuft aber nicht.
          </p>
          <p className="text-muted-foreground">Ollama-App starten oder im Terminal ausführen:</p>
          <Command cmd="ollama serve" />
        </>
      )}
      {!status.reachable && status.installed === null && (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Der Ollama-Server unter der angegebenen Adresse antwortet nicht.
          </p>
          <p className="text-muted-foreground">
            Prüfe, ob der Server läuft und im Netzwerk erreichbar ist (dort <code>OLLAMA_HOST=0.0.0.0</code> setzen). Für eine lokale
            Installation die URL auf <code>http://localhost:11434</code> ändern.
          </p>
        </>
      )}
      {status.reachable && status.missingModels.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" /> Folgende Modelle fehlen noch:
          </p>
          {status.missingModels.map((m) => (
            <Command key={m} cmd={`ollama pull ${m}`} />
          ))}
          <p className="text-xs text-muted-foreground">Download je nach Modell mehrere GB. Danach erneut prüfen.</p>
        </>
      )}
    </div>
  )
}

function CheckRow({ label, check }: { label: string; check: ModelCheck }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {check.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p>
          <span className="font-medium">{label}</span> <span className="font-mono text-xs">{check.model}</span>
          {check.latency_ms !== undefined && (
            <span className="text-muted-foreground"> · {(check.latency_ms / 1000).toFixed(1)} s</span>
          )}
        </p>
        {(check.error ?? check.detail) && (
          <p className={check.error ? 'text-destructive' : 'text-muted-foreground'}>{check.error ?? check.detail}</p>
        )}
      </div>
    </div>
  )
}

/** Sends a sample document to the text model and a sample scan to the vision model. */
export function ModelTest() {
  const [result, setResult] = useState<ModelTestResult | null>(null)
  const [running, setRunning] = useState(false)

  const run = async (): Promise<void> => {
    setRunning(true)
    setResult(null)
    try {
      setResult(await api['settings:testModels'](await renderSamplePng()))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" disabled={running} onClick={() => void run()}>
        {running ? <Loader2 className="animate-spin" /> : <FlaskConical />} Modelle testen
      </Button>
      {running && (
        <p className="text-xs text-muted-foreground">Der erste Aufruf lädt die Modelle in den Speicher und kann eine Weile dauern.</p>
      )}
      {result && (
        <div className="space-y-2 rounded-lg border p-3">
          <CheckRow label="Klassifikation" check={result.text} />
          <CheckRow label="Texterkennung" check={result.vision} />
        </div>
      )}
    </div>
  )
}
