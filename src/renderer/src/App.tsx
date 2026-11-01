import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { Toaster } from '@/components/ui/sonner'
import type { Settings as SettingsT } from '@shared/types'
import { api } from '@/lib/api'
import { Categories } from '@/routes/Categories'
import { Dashboard } from '@/routes/Dashboard'
import { DocumentDetail } from '@/routes/DocumentDetail'
import { Documents } from '@/routes/Documents'
import { References } from '@/routes/References'
import { Settings } from '@/routes/Settings'
import { Setup } from '@/routes/Setup'
import { Trash } from '@/routes/Trash'

export function App() {
  const [initial, setInitial] = useState<SettingsT | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    void api['settings:get']().then((s) => {
      setInitial(s)
      setConfigured(!!s.libraryPath && s.setupCompleted)
    })
  }, [])

  return (
    <>
      {configured === false && initial && <Setup initial={initial} onDone={() => setConfigured(true)} />}
      {configured && (
        <HashRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/documents/:id" element={<DocumentDetail />} />
              <Route path="/references" element={<References />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/categories" element={<Categories />} />
            </Routes>
          </AppShell>
        </HashRouter>
      )}
      <Toaster richColors position="bottom-right" />
    </>
  )
}
