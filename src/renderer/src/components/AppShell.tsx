import { useState, type DragEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import { FileText, FolderArchive, LayoutDashboard, Plus, Search, Settings, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SEARCH_INPUT_ID, useHotkeys } from '@/lib/hotkeys'
import { importFiles, pickAndImport } from '@/lib/import'
import { ShortcutHelp } from './ShortcutHelp'
import { UpdateReadyButton } from './Updates'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.svg'

const nav = [
  { to: '/', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Dokumente', icon: FileText },
  { to: '/references', label: 'Physische Ablage', icon: FolderArchive },
  { to: '/trash', label: 'Papierkorb', icon: Trash2 },
  { to: '/settings', label: 'Einstellungen', icon: Settings }
]

export function AppShell({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState(false)
  const [help, setHelp] = useState(false)

  useHotkeys({
    'mod+k': () => {
      const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null
      input?.focus()
      input?.select()
    },
    '?': () => setHelp(true)
  })

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files)
  }

  return (
    <div
      className="flex h-full"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5 text-sidebar-accent-foreground">
          <img src={logo} alt="" className="size-6" />
          <span className="text-lg font-semibold tracking-tight">Ablage</span>
          <span className="mt-1 text-xs opacity-60">{import.meta.env.DEV ? 'dev' : `v${__APP_VERSION__}`}</span>
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full justify-start" onClick={() => void pickAndImport()}>
            <Plus /> Importieren
          </Button>
          <UpdateReadyButton />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="px-5 pt-4 text-xs opacity-60">Dateien hierher ziehen zum Importieren</p>
        <button type="button" className="px-5 pt-1 pb-4 text-left text-xs opacity-60 hover:opacity-100" onClick={() => setHelp(true)}>
          <kbd className="font-mono">?</kbd> Tastaturkürzel
        </button>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center border-b bg-background px-8 py-3">
          <GlobalSearch />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-background/90 px-12 py-10 text-primary">
              <Upload className="size-10" />
              <span className="text-lg font-medium">Loslassen zum Importieren</span>
            </div>
          </div>
        )}
      </main>
      <ShortcutHelp open={help} onOpenChange={setHelp} />
    </div>
  )
}

/** The query lives in `/documents?q=`; typing elsewhere jumps to the document list. */
function GlobalSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onDocuments = location.pathname === '/documents'
  const value = onDocuments ? (params.get('q') ?? '') : ''

  const change = (q: string): void => {
    const next = new URLSearchParams(onDocuments ? params : undefined)
    if (q) next.set('q', q)
    else next.delete('q')
    navigate({ pathname: '/documents', search: next.toString() }, { replace: onDocuments })
  }

  return (
    <div className="relative w-full">
      <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
      <Input
        id={SEARCH_INPUT_ID}
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') {
            e.preventDefault()
            if (e.key === 'Escape' && value) change('')
            else e.currentTarget.blur()
          }
        }}
        placeholder="Volltextsuche in Titel, Absender und Inhalt …"
        className="pr-16 pl-9"
      />
      <kbd className="pointer-events-none absolute top-2 right-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        Strg K
      </kbd>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b bg-background/80 px-8 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
