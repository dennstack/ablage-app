import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { LayoutGrid, List, X } from 'lucide-react'
import { CardSizeToggle, cardGridClass, useCardSize } from '@/components/CardSize'
import { DocumentCard } from '@/components/DocumentCard'
import { CategorySelect } from '@/components/CategorySelect'
import { ConfirmTrash } from '@/components/ConfirmTrash'
import { Highlight } from '@/components/Highlight'
import { PageHeader } from '@/components/AppShell'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatAmount, formatDate } from '@/lib/format'
import { useCategories, useData, useDebounced } from '@/lib/hooks'
import { useHotkeys } from '@/lib/hotkeys'
import { cn } from '@/lib/utils'

const PAGE = 48

export function Documents() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { categories, label } = useCategories()
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('docView') as 'grid' | 'list') ?? 'grid')
  const [cardSize, setCardSize] = useCardSize()
  const [limit, setLimit] = useState(PAGE)
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const debouncedQ = useDebounced(q)
  const [sel, setSel] = useState(-1)
  const [trashId, setTrashId] = useState<string | null>(null)

  const { data } = useData(
    () => api['documents:list']({ q: debouncedQ, category, from: from || undefined, to: to || undefined, limit }),
    [debouncedQ, category, from, to, limit]
  )

  const items = data?.items ?? []
  const current = items[sel]

  useEffect(() => {
    setSel((s) => Math.min(s, items.length - 1))
  }, [items.length])

  useEffect(() => setLimit(PAGE), [debouncedQ])

  useEffect(() => {
    if (sel >= 0) document.querySelector(`[data-doc-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  useHotkeys({
    j: () => setSel((s) => Math.min(s + 1, items.length - 1)),
    k: () => setSel((s) => Math.max(s - 1, 0)),
    enter: (e) => {
      if (!current || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return false
      navigate(`/documents/${current.id}`)
    },
    e: () => {
      if (current) navigate(`/documents/${current.id}`, { state: { edit: true } })
    },
    delete: () => {
      if (current) setTrashId(current.id)
    },
    escape: () => setSel(-1)
  })

  const setParam = (key: string, value: string): void => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }

  const switchView = (v: 'grid' | 'list'): void => {
    setView(v)
    localStorage.setItem('docView', v)
  }

  const hasFilter = !!(q || category || from || to)

  return (
    <>
      <PageHeader
        title="Dokumente"
        description={data ? `${data.total} Dokument${data.total === 1 ? '' : 'e'}` : undefined}
        actions={
          <>
            {view === 'grid' && <CardSizeToggle value={cardSize} onChange={setCardSize} />}
            <div className="flex rounded-md border p-0.5">
              <Button size="icon" variant={view === 'grid' ? 'secondary' : 'ghost'} className="size-8" onClick={() => switchView('grid')}>
                <LayoutGrid />
              </Button>
              <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="size-8" onClick={() => switchView('list')}>
                <List />
              </Button>
            </div>
          </>
        }
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <CategorySelect categories={categories} value={category} onChange={(v) => setParam('category', v)} allowAll className="w-56" />
          <Input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className="w-40" title="Datum von" />
          <Input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className="w-40" title="Datum bis" />
          {hasFilter && (
            <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
              <X /> Zurücksetzen
            </Button>
          )}
        </div>

        {data && data.items.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">{hasFilter ? 'Keine Treffer.' : 'Noch keine Dokumente.'}</p>
        )}

        {view === 'grid' ? (
          <div className={cardGridClass[cardSize]}>
            {items.map((d, i) => (
              <DocumentCard key={d.id} doc={d} index={i} selected={i === sel} size={cardSize} categoryLabel={label(d.category_id)} />
            ))}
          </div>
        ) : (
          data &&
          data.items.length > 0 && (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Titel</TableHead>
                    <TableHead>Absender</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead className="pr-4 text-right">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((d, i) => (
                    <TableRow
                      key={d.id}
                      data-doc-index={i}
                      data-state={i === sel ? 'selected' : undefined}
                      className={cn('cursor-pointer', i === sel && 'ring-2 ring-primary ring-inset')}
                      onClick={() => navigate(`/documents/${d.id}`)}
                    >
                      <TableCell className="max-w-md pl-4 whitespace-normal">
                        <div className="flex items-center gap-2 font-medium">
                          {d.title} <StatusBadge status={d.status} message={d.status_message} />
                        </div>
                        {d.snippet && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            <Highlight text={d.snippet} />
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{d.sender ?? '–'}</TableCell>
                      <TableCell>{formatDate(d.doc_date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{label(d.category_id)}</Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">{formatAmount(d.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {data && data.items.length < data.total && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              Weitere laden ({data.total - data.items.length})
            </Button>
          </div>
        )}
      </div>
      <ConfirmTrash id={trashId} title={items.find((d) => d.id === trashId)?.title} onOpenChange={(o) => !o && setTrashId(null)} />
    </>
  )
}
