import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/AppShell'
import { Thumbnail } from '@/components/DocumentCard'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useData } from '@/lib/hooks'

export function Trash() {
  const { data } = useData(() => api['trash:list']())

  const act = async (fn: () => Promise<void>, msg: string): Promise<void> => {
    try {
      await fn()
      toast.success(msg)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader title="Papierkorb" description="Gelöschte Dokumente liegen in „.ablage/trash“ im Bibliotheksordner." />
      <div className="space-y-2 p-8">
        {data?.items.length === 0 && <p className="py-16 text-center text-muted-foreground">Der Papierkorb ist leer.</p>}
        {data?.items.map((d) => (
          <div key={d.id} className="flex items-center gap-4 rounded-xl border bg-card p-3">
            <Thumbnail id={d.id} updatedAt={d.updated_at} className="h-16 w-12 rounded" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">Gelöscht {formatDateTime(d.deleted_at)}</div>
            </div>
            <Button variant="outline" onClick={() => void act(() => api['trash:restore'](d.id), 'Wiederhergestellt')}>
              <RotateCcw /> Wiederherstellen
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (confirm(`„${d.title}“ endgültig löschen? Die Datei wird entfernt.`))
                  void act(() => api['trash:purge'](d.id), 'Endgültig gelöscht')
              }}
            >
              <Trash2 /> Endgültig löschen
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}
