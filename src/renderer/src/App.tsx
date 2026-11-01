import { useEffect, useState } from 'react'
import { createHashRouter, Outlet, RouterProvider } from 'react-router'
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

// useBlocker in the category editor needs a data router.
const router = createHashRouter([
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/documents', element: <Documents /> },
      { path: '/documents/:id', element: <DocumentDetail /> },
      { path: '/references', element: <References /> },
      { path: '/trash', element: <Trash /> },
      { path: '/settings', element: <Settings /> },
      { path: '/settings/categories', element: <Categories /> }
    ]
  }
])

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
      {configured && <RouterProvider router={router} />}
      <Toaster richColors position="bottom-right" />
    </>
  )
}
