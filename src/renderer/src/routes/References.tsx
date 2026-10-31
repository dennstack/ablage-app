import { useState } from 'react'
import { toast } from 'sonner'
import { Dices, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { PhysicalReference, ReferenceInput } from '@shared/types'
import { CategorySelect } from '@/components/CategorySelect'
import { PageHeader } from '@/components/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useCategories, useData } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const emptyRef = (folder = ''): ReferenceInput => ({
  folder_code: folder,
  doc_id_code: '',
  title: '',
  category_id: 'sonstiges',
  description: null,
  doc_date: null,
  sender: null
})

export function References() {
  const { categories, label } = useCategories()
  const [folder, setFolder] = useState('')
  const [search, setSearch] = useState('')
  const folders = useData(() => api['folders:list'](), [], false)
  const refs = useData(() => api['references:list'](folder || undefined), [folder], false)
  const [folderDialog, setFolderDialog] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; value: ReferenceInput } | null>(null)

  const reloadAll = async (): Promise<void> => {
    await Promise.all([folders.reload(), refs.reload()])
  }

  const filtered = (refs.data ?? []).filter((r) => {
    const s = search.trim().toLowerCase()
    if (!s) return true
    return [r.title, r.sender, r.doc_id_code, r.description, r.folder_code].some((v) => v?.toLowerCase().includes(s))
  })

  const remove = async (r: PhysicalReference): Promise<void> => {
    if (!confirm(`Referenz „${r.title}“ löschen?`)) return
    try {
      await api['references:delete'](r.id)
      await reloadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Physische Ablage"
        description="Papierdokumente, die im Ordner bleiben: Ordner-Code + Dokument-Code machen sie auffindbar."
        actions={
          <>
            <Button variant="outline" onClick={() => setFolderDialog(true)}>
              <FolderPlus /> Ordner
            </Button>
            <Button disabled={!folders.data?.length} onClick={() => setEditing({ value: emptyRef(folder || folders.data?.[0]?.code) })}>
              <Plus /> Referenz
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-[260px_1fr] gap-6 p-8">
        <div className="space-y-1">
          <FolderButton active={!folder} onClick={() => setFolder('')} title="Alle Ordner" />
          {folders.data?.map((f) => (
            <div key={f.code} className="group flex items-center">
              <FolderButton
                active={folder === f.code}
                onClick={() => setFolder(f.code)}
                title={f.label}
                code={f.code}
                count={f.reference_count}
                location={f.location}
              />
              {f.reference_count === 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  onClick={async () => {
                    try {
                      await api['folders:delete'](f.code)
                      if (folder === f.code) setFolder('')
                      await folders.reload()
                    } catch (err) {
                      toast.error(errorMessage(err))
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {folders.data?.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Lege zuerst einen Ordner an.</p>}
        </div>

        <div className="space-y-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Referenzen durchsuchen …" />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Code</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Ordner</TableHead>
                  <TableHead>Absender</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 font-mono font-semibold">{r.doc_id_code}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <div className="font-medium">{r.title}</div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    </TableCell>
                    <TableCell className="font-mono">{r.folder_code}</TableCell>
                    <TableCell>{r.sender ?? '–'}</TableCell>
                    <TableCell>{formatDate(r.doc_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{label(r.category_id)}</Badge>
                    </TableCell>
                    <TableCell className="pr-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing({ id: r.id, value: { ...r } })}>
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void remove(r)}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Keine Referenzen.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <FolderDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        onCreated={async (code) => {
          await folders.reload()
          setFolder(code)
        }}
      />
      {editing && (
        <ReferenceDialog
          initial={editing.value}
          id={editing.id}
          folders={folders.data ?? []}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={reloadAll}
        />
      )}
    </>
  )
}

function FolderButton(props: { active: boolean; onClick: () => void; title: string; code?: string; count?: number; location?: string | null }) {
  return (
    <button
      onClick={props.onClick}
      className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent', props.active && 'bg-accent font-medium')}
    >
      {props.code && <span className="font-mono text-xs text-muted-foreground">{props.code}</span>}
      <span className="flex-1 truncate" title={props.location ?? undefined}>
        {props.title}
      </span>
      {props.count !== undefined && <span className="text-xs text-muted-foreground">{props.count}</span>}
    </button>
  )
}

function FolderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [labelText, setLabelText] = useState('')
  const [location, setLocation] = useState('')

  const submit = async (): Promise<void> => {
    try {
      const f = await api['folders:create']({ code, label: labelText, location: location || null })
      onOpenChange(false)
      setCode('')
      setLabelText('')
      setLocation('')
      onCreated(f.code)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Ordner</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Code (Rückenschild)">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. 32BD1" />
          </Field>
          <Field label="Bezeichnung">
            <Input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Finanzen 2024" />
          </Field>
          <Field label="Standort">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Regal links, Fach 2" />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!code.trim() || !labelText.trim()} onClick={() => void submit()}>
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReferenceDialog(props: {
  initial: ReferenceInput
  id?: string
  folders: { code: string; label: string }[]
  categories: Parameters<typeof CategorySelect>[0]['categories']
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [v, setV] = useState<ReferenceInput>(props.initial)
  const set = <K extends keyof ReferenceInput>(k: K, value: ReferenceInput[K]): void => setV({ ...v, [k]: value })

  const generate = async (): Promise<void> => set('doc_id_code', await api['references:generateCode']())

  const submit = async (): Promise<void> => {
    try {
      if (props.id) await api['references:update'](props.id, v)
      else await api['references:create'](v)
      await props.onSaved()
      props.onClose()
      toast.success(props.id ? 'Referenz gespeichert' : `Referenz ${v.doc_id_code} angelegt`, {
        description: props.id ? undefined : 'Code auf das Dokument schreiben und in den Ordner legen.'
      })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{props.id ? 'Referenz bearbeiten' : 'Neue Referenz'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ordner">
            <Select value={v.folder_code} onValueChange={(x) => set('folder_code', x)}>
              <SelectTrigger>
                <SelectValue placeholder="Ordner wählen" />
              </SelectTrigger>
              <SelectContent>
                {props.folders.map((f) => (
                  <SelectItem key={f.code} value={f.code}>
                    {f.code} – {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Dokument-Code">
            <div className="flex gap-2">
              <Input className="font-mono" value={v.doc_id_code} onChange={(e) => set('doc_id_code', e.target.value.toUpperCase())} />
              <Button type="button" variant="outline" size="icon" title="Code generieren" onClick={() => void generate()}>
                <Dices />
              </Button>
            </div>
          </Field>
          <div className="col-span-2">
            <Field label="Titel">
              <Input value={v.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
          </div>
          <Field label="Kategorie">
            <CategorySelect categories={props.categories} value={v.category_id} onChange={(x) => set('category_id', x)} />
          </Field>
          <Field label="Datum">
            <Input type="date" value={v.doc_date ?? ''} onChange={(e) => set('doc_date', e.target.value || null)} />
          </Field>
          <div className="col-span-2">
            <Field label="Absender">
              <Input value={v.sender ?? ''} onChange={(e) => set('sender', e.target.value || null)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Beschreibung">
              <Textarea value={v.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!v.folder_code || !v.doc_id_code.trim() || !v.title.trim()} onClick={() => void submit()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
