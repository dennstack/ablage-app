import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import { DocumentCard } from '@/components/DocumentCard'
import { CategorySelect } from '@/components/CategorySelect'
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

const PAGE = 48

export function Documents() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { categories, label } = useCategories()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('docView') as 'grid' | 'list') ?? 'grid')
  const [limit, setLimit] = useState(PAGE)
  const category = params.get('category') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const debouncedQ = useDebounced(q)

  const { data } = useData(
    () => api['documents:list']({ q: debouncedQ, category, from: from || undefined, to: to || undefined, limit }),
    [debouncedQ, category, from, to, limit]
  )

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
          <div className="flex rounded-md border p-0.5">
            <Button size="icon" variant={view === 'grid' ? 'secondary' : 'ghost'} className="size-8" onClick={() => switchView('grid')}>
              <LayoutGrid />
            </Button>
            <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="size-8" onClick={() => switchView('list')}>
              <List />
            </Button>
          </div>
        }
      />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-72 flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setLimit(PAGE)
              }}
              placeholder="Volltextsuche in Titel, Absender und Inhalt …"
              className="pl-9"
            />
          </div>
          <CategorySelect categories={categories} value={category} onChange={(v) => setParam('category', v)} allowAll className="w-56" />
          <Input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className="w-40" title="Datum von" />
          <Input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className="w-40" title="Datum bis" />
          {hasFilter && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ('')
                setParams({}, { replace: true })
              }}
            >
              <X /> Zurücksetzen
            </Button>
          )}
        </div>

        {data && data.items.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">{hasFilter ? 'Keine Treffer.' : 'Noch keine Dokumente.'}</p>
        )}

        {view === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {data?.items.map((d) => <DocumentCard key={d.id} doc={d} categoryLabel={label(d.category_id)} />)}
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
                  {data.items.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/documents/${d.id}`)}>
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
    </>
  )
}
