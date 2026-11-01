import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { categoryId, FALLBACK_CATEGORY } from '@shared/categories'
import type { Category, CategorySaveResult, CategoryUsage } from '@shared/types'
import { PageHeader } from '@/components/AppShell'
import { CategorySelect } from '@/components/CategorySelect'
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
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { invalidateCategories } from '@/lib/hooks'

/** `id` stays null until the first save, so it derives from the final label. */
interface Row {
  key: string
  id: string | null
  label: string
  keywords: string
  subcategories: Row[]
}

interface PendingDelete {
  row: Row
  parent: Row | null
  count: number
  target: string
}

function toRow(c: Category): Row {
  return {
    key: c.id,
    id: c.id,
    label: c.label,
    keywords: (c.keywords ?? []).join(', '),
    subcategories: (c.subcategories ?? []).map(toRow)
  }
}

function newRow(): Row {
  return { key: crypto.randomUUID(), id: null, label: '', keywords: '', subcategories: [] }
}

function toRows(categories: Category[]): Row[] {
  const rows = categories.map(toRow)
  if (rows.some((r) => r.id === FALLBACK_CATEGORY)) return rows
  return [...rows, toRow({ id: FALLBACK_CATEGORY, label: 'Sonstiges', keywords: [] })]
}

function parseKeywords(text: string): string[] {
  return [...new Set(text.split(',').map((k) => k.trim()).filter(Boolean))]
}

function rowIds(row: Row): string[] {
  return [row, ...row.subcategories].flatMap((r) => (r.id ? [r.id] : []))
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function usageTotal(u: CategoryUsage | undefined): number {
  return u ? u.documents + u.trashed + u.references : 0
}

export function Categories() {
  const navigate = useNavigate()
  const [original, setOriginal] = useState<Category[] | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [usage, setUsage] = useState<Record<string, CategoryUsage>>({})
  const [reassign, setReassign] = useState<Record<string, string>>({})
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [confirmMoves, setConfirmMoves] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const [categories, nextUsage] = await Promise.all([api['categories:list'](), api['categories:usage']()])
      setOriginal(categories)
      setRows(toRows(categories))
      setUsage(nextUsage)
      setReassign({})
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Includes documents already redirected to this id in the draft. */
  const usageOf = (id: string): number =>
    usageTotal(usage[id]) +
    Object.entries(reassign)
      .filter(([, target]) => target === id)
      .reduce((sum, [from]) => sum + usageTotal(usage[from]), 0)

  const patchRow = (key: string, patch: Partial<Row>): void => {
    setRows((list) =>
      list.map((r) =>
        r.key === key
          ? { ...r, ...patch }
          : { ...r, subcategories: r.subcategories.map((s) => (s.key === key ? { ...s, ...patch } : s)) }
      )
    )
  }

  const removeRow = (row: Row, target?: string): void => {
    setRows((list) =>
      list
        .filter((r) => r.key !== row.key)
        .map((r) => ({ ...r, subcategories: r.subcategories.filter((s) => s.key !== row.key) }))
    )
    if (!target) return
    const ids = rowIds(row)
    setReassign((map) => {
      const next = Object.fromEntries(Object.entries(map).map(([from, to]) => [from, ids.includes(to) ? target : to]))
      for (const id of ids) if (usageTotal(usage[id]) > 0) next[id] = target
      return next
    })
  }

  const requestDelete = (row: Row, parent: Row | null): void => {
    const count = rowIds(row).reduce((sum, id) => sum + usageOf(id), 0)
    if (count === 0) {
      removeRow(row)
      return
    }
    setPendingDelete({ row, parent, count, target: parent?.id ?? FALLBACK_CATEGORY })
  }

  /** Only saved rows can receive documents; new rows have no id yet. */
  const deleteTargets = useMemo((): Category[] => {
    const excluded = pendingDelete?.row.key
    const saved = (r: Row): boolean => r.id !== null && r.key !== excluded
    return rows.filter(saved).map((r) => ({
      id: r.id as string,
      label: r.label,
      keywords: [],
      subcategories: r.subcategories.filter(saved).map((s) => ({ id: s.id as string, label: s.label, keywords: [] }))
    }))
  }, [rows, pendingDelete])

  const buildCategories = (): Category[] => {
    const taken = new Set([
      ...(original ?? []).flatMap((c) => [c.id, ...(c.subcategories ?? []).map((s) => s.id)]),
      ...rows.flatMap(rowIds),
      ...Object.keys(usage)
    ])
    const assign = (row: Row, parentId?: string): string => {
      if (row.id) return row.id
      const id = categoryId(row.label, taken, parentId)
      taken.add(id)
      return id
    }
    return rows.map((row) => {
      const id = assign(row)
      const base = { id, label: row.label, keywords: parseKeywords(row.keywords) }
      if (row.subcategories.length === 0) return base
      return {
        ...base,
        subcategories: row.subcategories.map((s) => ({
          id: assign(s, id),
          label: s.label,
          keywords: parseKeywords(s.keywords)
        }))
      }
    })
  }

  const pendingMoves = (): number => {
    const reassigned = Object.keys(reassign).reduce((sum, id) => sum + (usage[id]?.documents ?? 0), 0)
    const renamed = rows
      .filter((r) => {
        const old = original?.find((c) => c.id === r.id)
        return old !== undefined && old.label.trim() !== r.label.trim()
      })
      .flatMap(rowIds)
      .reduce((sum, id) => sum + (usage[id]?.documents ?? 0), 0)
    return reassigned + renamed
  }

  const report = (result: CategorySaveResult): void => {
    if (result.failed.length > 0) {
      const titles = result.failed.slice(0, 3).map((f) => `„${f.title}“`).join(', ')
      const more = result.failed.length > 3 ? ' …' : ''
      toast.error(`${plural(result.failed.length, 'Dokument', 'Dokumente')} nicht aktualisiert: ${titles}${more}`, {
        description: result.failed[0].message,
        duration: 15000
      })
      return
    }
    toast.success(result.moved > 0 ? `Kategorien gespeichert, ${plural(result.moved, 'Datei', 'Dateien')} verschoben` : 'Kategorien gespeichert')
  }

  const save = async (): Promise<void> => {
    setConfirmMoves(0)
    setSaving(true)
    try {
      report(await api['categories:save']({ categories: buildCategories(), reassign }))
      await load()
      await invalidateCategories()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const requestSave = (): void => {
    const moves = pendingMoves()
    if (moves > 0) setConfirmMoves(moves)
    else void save()
  }

  const header = (
    <PageHeader
      title="Kategorien"
      description="Der Name einer Hauptkategorie ist auch ihr Ordner in der Bibliothek."
      actions={
        <Button variant="ghost" onClick={() => void navigate('/settings')}>
          <ArrowLeft className="size-4" /> Einstellungen
        </Button>
      }
    />
  )

  if (loadError) {
    return (
      <>
        {header}
        <div className="space-y-4 p-8">
          <p className="text-sm text-destructive">categories.yaml konnte nicht gelesen werden: {loadError}</p>
          <Button variant="outline" onClick={() => void api['categories:openFile']()}>
            Datei bearbeiten
          </Button>
        </div>
      </>
    )
  }

  if (!original) return header

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        {rows.map((row) => (
          <Card key={row.key}>
            <CardContent className="space-y-4">
              <CategoryFields
                row={row}
                usageCount={row.id ? usageOf(row.id) : 0}
                disabled={saving}
                onChange={patchRow}
                onDelete={row.id === FALLBACK_CATEGORY ? undefined : () => requestDelete(row, null)}
              />
              {row.subcategories.length > 0 && (
                <div className="space-y-3 border-l pl-4">
                  {row.subcategories.map((sub) => (
                    <CategoryFields
                      key={sub.key}
                      row={sub}
                      usageCount={sub.id ? usageOf(sub.id) : 0}
                      disabled={saving}
                      onChange={patchRow}
                      onDelete={() => requestDelete(sub, row)}
                    />
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => patchRow(row.key, { subcategories: [...row.subcategories, newRow()] })}
              >
                <Plus className="size-4" /> Unterkategorie
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={saving} onClick={() => setRows((list) => [...list, newRow()])}>
            <Plus className="size-4" /> Hauptkategorie
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setRows(toRows(original))
                setReassign({})
              }}
            >
              Verwerfen
            </Button>
            <Button disabled={saving} onClick={requestSave}>
              {saving && <Loader2 className="size-4 animate-spin" />} Speichern
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>„{pendingDelete?.row.label}“ löschen?</DialogTitle>
            <DialogDescription>
              {plural(pendingDelete?.count ?? 0, 'Eintrag', 'Einträge')} inklusive Unterkategorien, Papierkorb und Referenzen wechseln beim Speichern in die
              Zielkategorie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Zielkategorie</Label>
            <CategorySelect
              categories={deleteTargets}
              value={pendingDelete?.target ?? ''}
              onChange={(target) => setPendingDelete((p) => (p ? { ...p, target } : p))}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) removeRow(pendingDelete.row, pendingDelete.target)
                setPendingDelete(null)
              }}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmMoves > 0} onOpenChange={(open) => !open && setConfirmMoves(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderungen speichern?</AlertDialogTitle>
            <AlertDialogDescription>
              Betrifft bis zu {plural(confirmMoves, 'Dokument', 'Dokumente')}: Sie werden neu zugeordnet oder in andere Ordner verschoben. Auf einem
              Netzlaufwerk kann das dauern.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>Speichern</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CategoryFields({
  row,
  usageCount,
  disabled,
  onChange,
  onDelete
}: {
  row: Row
  usageCount: number
  disabled: boolean
  onChange: (key: string, patch: Partial<Row>) => void
  onDelete?: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_1.5fr_auto] items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor={`${row.key}-label`}>Name</Label>
        <Input id={`${row.key}-label`} value={row.label} disabled={disabled} onChange={(e) => onChange(row.key, { label: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${row.key}-keywords`}>Stichwörter (kommagetrennt)</Label>
        <Input
          id={`${row.key}-keywords`}
          value={row.keywords}
          disabled={disabled}
          onChange={(e) => onChange(row.key, { keywords: e.target.value })}
        />
      </div>
      <div className="flex h-9 items-center gap-2">
        <span className="w-8 text-right text-xs text-muted-foreground tabular-nums" title="Zugeordnete Einträge">
          {usageCount}
        </span>
        {/* Keeps columns aligned for the undeletable fallback category. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${row.label || 'Kategorie'} löschen`}
          disabled={disabled}
          className={onDelete ? undefined : 'invisible'}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
