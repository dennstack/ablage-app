import { useState } from 'react'
import { Link } from 'react-router'
import { FileText } from 'lucide-react'
import type { DocumentListItem } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { formatAmount, formatDate } from '@/lib/format'
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

export function DocumentCard({
  doc,
  categoryLabel,
  selected,
  index
}: {
  doc: DocumentListItem
  categoryLabel: string
  selected?: boolean
  index?: number
}) {
  return (
    <Link
      to={`/documents/${doc.id}`}
      data-doc-index={index}
      className={`group flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <Thumbnail id={doc.id} updatedAt={doc.updated_at} className="aspect-[4/3] w-full border-b" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium group-hover:text-primary">{doc.title}</h3>
          <StatusBadge status={doc.status} message={doc.status_message} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{formatDate(doc.doc_date)}</span>
          {doc.sender && <span className="truncate">{doc.sender}</span>}
          {doc.amount !== null && <span>{formatAmount(doc.amount)}</span>}
        </div>
        {doc.snippet && (
          <p className="line-clamp-3 text-xs text-muted-foreground">
            <Highlight text={doc.snippet} />
          </p>
        )}
        <div className="mt-auto pt-1">
          <Badge variant="outline">{categoryLabel}</Badge>
        </div>
      </div>
    </Link>
  )
}
