import { useState } from 'react'
import { Link } from 'react-router'
import { FileText } from 'lucide-react'
import type { DocumentListItem } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { formatAmount, formatDate } from '@/lib/format'
import type { CardSize } from './CardSize'
import { Highlight } from './Highlight'
import { StatusBadge } from './StatusBadge'

export function Thumbnail({ id, updatedAt, className }: { id: string; updatedAt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ''}`}>
        <FileText className="size-8" />
      </div>
    )
  return (
    <img
      src={`ablage://thumb/${id}?v=${encodeURIComponent(updatedAt)}`}
      alt=""
      loading="lazy"
      className={`bg-muted object-cover object-top ${className ?? ''}`}
      onError={() => setFailed(true)}
    />
  )
}

const SIZE_STYLES: Record<CardSize, { thumb: string; body: string; title: string; snippet: string | null }> = {
  s: { thumb: 'aspect-[16/9]', body: 'gap-1.5 p-2', title: 'line-clamp-2 text-xs', snippet: null },
  m: { thumb: 'aspect-[16/9]', body: 'gap-1.5 p-3', title: 'line-clamp-2 text-sm', snippet: 'line-clamp-2' },
  l: { thumb: 'aspect-[4/3]', body: 'gap-2 p-4', title: 'line-clamp-2', snippet: 'line-clamp-3' }
}

export function DocumentCard({
  doc,
  categoryLabel,
  selected,
  index,
  size = 'm'
}: {
  doc: DocumentListItem
  categoryLabel: string
  selected?: boolean
  index?: number
  size?: CardSize
}) {
  const styles = SIZE_STYLES[size]
  return (
    <Link
      to={`/documents/${doc.id}`}
      data-doc-index={index}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <Thumbnail id={doc.id} updatedAt={doc.updated_at} className={`${styles.thumb} w-full border-b`} />
      <div className={`flex flex-1 flex-col ${styles.body}`}>
        <div className="flex flex-wrap items-start justify-between gap-1 [&>[data-slot=badge]]:max-w-full">
          <h3 className={`min-w-0 font-medium group-hover:text-primary ${styles.title}`}>{doc.title}</h3>
          <StatusBadge status={doc.status} message={doc.status_message} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatDate(doc.doc_date)}</span>
          {doc.sender && <span className="min-w-0 truncate">{doc.sender}</span>}
          {doc.amount !== null && <span>{formatAmount(doc.amount)}</span>}
        </div>
        {doc.snippet && styles.snippet && (
          <p className={`text-xs text-muted-foreground ${styles.snippet}`}>
            <Highlight text={doc.snippet} />
          </p>
        )}
        <div className="mt-auto min-w-0 pt-0.5">
          <Badge variant="outline" className="block max-w-full truncate" title={categoryLabel}>
            {categoryLabel}
          </Badge>
        </div>
      </div>
    </Link>
  )
}
