import { Link } from 'react-router'
import { AlertCircle, FileText, FolderArchive, Loader2 } from 'lucide-react'
import { DocumentCard } from '@/components/DocumentCard'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useCategories, useData } from '@/lib/hooks'
import { pickAndImport } from '@/lib/import'

export function Dashboard() {
  const { data } = useData(() => api['dashboard:get']())
  const { label } = useCategories()

  const stats = [
    { label: 'Dokumente', value: data?.counts.total, icon: FileText, to: '/documents' },
    { label: 'In Verarbeitung', value: data?.counts.pending, icon: Loader2, to: '/documents' },
    { label: 'Fehler', value: data?.counts.errors, icon: AlertCircle, to: '/documents' },
    { label: 'Physische Referenzen', value: data?.counts.references, icon: FolderArchive, to: '/references' }
  ]

  return (
    <>
      <PageHeader title="Übersicht" />
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map(({ label: l, value, icon: Icon, to }) => (
            <Link key={l} to={to}>
              <Card className="gap-2 py-4 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{l}</CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="px-4 text-2xl font-semibold">{value ?? <Skeleton className="h-8 w-12" />}</CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Zuletzt hinzugefügt</h2>
            <Button variant="link" asChild>
              <Link to="/documents">Alle anzeigen</Link>
            </Button>
          </div>
          {data && data.recent.length === 0 ? (
            <Card className="items-center py-12 text-center">
              <CardContent className="space-y-3">
                <p className="text-muted-foreground">Noch keine Dokumente. Dateien ins Fenster ziehen oder in den Ordner „Eingang“ legen.</p>
                <Button onClick={() => void pickAndImport()}>Dokumente importieren</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {data?.recent.map((d) => <DocumentCard key={d.id} doc={d} categoryLabel={label(d.category_id)} />)}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
