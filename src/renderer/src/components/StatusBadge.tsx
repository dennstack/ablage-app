import { AlertCircle, Loader2 } from 'lucide-react'
import type { DocStatus } from '@shared/types'
import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status, message }: { status: DocStatus; message?: string | null }) {
  if (status === 'done') return null
  if (status === 'error')
    return (
      <Badge variant="destructive" title={message ?? undefined}>
        <AlertCircle /> Fehler
      </Badge>
    )
  return (
    <Badge variant="secondary" title={message ?? undefined}>
      <Loader2 className="animate-spin" /> {status === 'pending' ? 'Wartet' : (message ?? 'Verarbeitung')}
    </Badge>
  )
}
