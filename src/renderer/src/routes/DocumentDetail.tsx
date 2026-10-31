import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, FolderOpen, MoreHorizontal, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import type { Document, DocumentPatch } from '@shared/types'
import { CategorySelect } from '@/components/CategorySelect'
import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useCategories, useData } from '@/lib/hooks'

interface FormState {
  title: string
  category_id: string
  sender: string
  doc_date: string
  amount: string
}

function toForm(d: Document): FormState {
  return {
    title: d.title,
    category_id: d.category_id,
    sender: d.sender ?? '',
    doc_date: d.doc_date ?? '',
    amount: d.amount === null ? '' : String(d.amount).replace('.', ',')
  }
}

function toPatch(f: FormState): DocumentPatch {
  const amount = f.amount.trim() ? Number(f.amount.replace(/\./g, '').replace(',', '.')) : null
  if (amount !== null && !Number.isFinite(amount)) throw new Error('Ungültiger Betrag')
  return {
    title: f.title.trim(),
    category_id: f.category_id,
    sender: f.sender.trim() || null,
    doc_date: f.doc_date || null,
    amount
  }
}

export function DocumentDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { categories } = useCategories()
  const { data: doc, loading } = useData(() => api['documents:get'](id), [id])
  const [form, setForm] = useState<FormState | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // live updates from the pipeline must not overwrite unsaved edits
  useEffect(() => {
    if (doc && !dirty) setForm(toForm(doc))
  }, [doc, dirty])

  if (loading && !doc) return null
  if (!doc || !form) return <p className="p-8 text-muted-foreground">Dokument nicht gefunden.</p>

  const set = (key: keyof FormState, value: string): void => {
    setForm({ ...form, [key]: value })
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const updated = await api['documents:update'](id, toPatch(form))
      setForm(toForm(updated))
      setDirty(false)
      toast.success('Gespeichert', { description: updated.relative_path })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const run = (fn: () => Promise<unknown>, msg: string) => async () => {
    try {
      await fn()
      toast.success(msg)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const fileUrl = `ablage://file/${doc.id}?v=${encodeURIComponent(doc.relative_path)}`
  const busy = doc.status === 'pending' || doc.status === 'processing'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </Button>
        <h1 className="truncate text-lg font-semibold">{doc.title}</h1>
        <StatusBadge status={doc.status} message={doc.status_message} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={run(() => api['documents:openExternal'](id), 'Geöffnet')}>
            <ExternalLink /> Öffnen
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={run(() => api['documents:showInFolder'](id), 'Im Explorer angezeigt')}>
                <FolderOpen /> Im Explorer zeigen
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={run(() => api['documents:reclassify'](id), 'Klassifikation gestartet')}>
                <Sparkles /> Neu klassifizieren
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={run(() => api['documents:reprocess'](id), 'Verarbeitung gestartet')}>
                <RefreshCw /> Texterkennung wiederholen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> In den Papierkorb
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-h-0 bg-muted/40">
          {doc.mime_type === 'application/pdf' ? (
            <iframe src={fileUrl} title={doc.title} className="h-full w-full border-0" />
          ) : doc.mime_type.startsWith('image/') ? (
            <div className="flex h-full items-start justify-center overflow-auto p-6">
              <img src={fileUrl} alt={doc.title} className="max-w-full shadow-md" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>Keine Vorschau für {doc.original_filename}</p>
              <Button variant="outline" onClick={run(() => api['documents:openExternal'](id), 'Geöffnet')}>
                <ExternalLink /> Mit Standardprogramm öffnen
              </Button>
            </div>
          )}
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto border-l p-5">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle>Metadaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Titel">
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label="Kategorie">
                <CategorySelect categories={categories} value={form.category_id} onChange={(v) => set('category_id', v)} />
              </Field>
              <Field label="Absender">
                <Input value={form.sender} onChange={(e) => set('sender', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum">
                  <Input type="date" value={form.doc_date} onChange={(e) => set('doc_date', e.target.value)} />
                </Field>
                <Field label="Betrag (€)">
                  <Input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0,00" />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>
                  Speichern
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setForm(toForm(doc))
                      setDirty(false)
                    }}
                  >
                    Verwerfen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {doc.status === 'error' && doc.status_message && (
            <Card className="gap-2 border-destructive/40 py-4">
              <CardContent className="px-4 text-sm text-destructive">{doc.status_message}</CardContent>
            </Card>
          )}

          <Card className="gap-3 py-4">
            <CardContent className="space-y-1.5 px-4 text-xs text-muted-foreground">
              <Info label="Datei" value={doc.relative_path} />
              <Info label="Original" value={doc.original_filename} />
              <Info label="Text" value={doc.ocr_source ?? '–'} />
              <Info label="Klassifikation" value={doc.classifier_source ?? '–'} />
              <Info label="Importiert" value={formatDateTime(doc.created_at)} />
              <Info label="Geändert" value={formatDateTime(doc.updated_at)} />
            </CardContent>
          </Card>

          <Collapsible title="Erkannter Text">
            <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">{doc.ocr_text || 'Kein Text vorhanden.'}</pre>
          </Collapsible>
          {doc.classifier_response && (
            <Collapsible title="Antwort des Klassifikators">
              <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">{doc.classifier_response}</pre>
            </Collapsible>
          )}
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>In den Papierkorb verschieben?</AlertDialogTitle>
            <AlertDialogDescription>Die Datei wird nach „.ablage/trash“ verschoben und kann wiederhergestellt werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await api['documents:delete'](id)
                  toast.success('In den Papierkorb verschoben')
                  navigate('/documents')
                } catch (err) {
                  toast.error(errorMessage(err))
                }
              }}
            >
              Verschieben
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0">{label}</span>
      <span className="break-all text-foreground">{value}</span>
    </div>
  )
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border bg-card p-4 shadow-xs">
      <summary className="cursor-pointer text-sm font-medium select-none">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
