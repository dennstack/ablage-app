import { useEffect, useRef } from 'react'

const OVERLAY = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]'

/** A handler returning `false` leaves the event to the browser. */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => boolean | void>

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/** Builds a key like `mod+k`, `?`, `j`, `delete`. `mod` = Ctrl or Cmd. */
function keyOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

/**
 * Registers keyboard shortcuts. Plain keys are ignored while typing in form fields;
 * everything except `mod+…` is ignored while a dialog or menu is open.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map)
  ref.current = map

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing) return
      const key = keyOf(e)
      const handler = ref.current[key]
      if (!handler) return
      const mod = key.startsWith('mod+')
      if (!mod && key !== 'escape' && isEditable(e.target)) return
      if (!mod && document.querySelector(OVERLAY)) return
      if (handler(e) !== false) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

export const SEARCH_INPUT_ID = 'document-search'

export const shortcutList: { keys: string[]; label: string }[] = [
  { keys: ['Strg', 'K'], label: 'Suche fokussieren' },
  { keys: ['J'], label: 'Nächstes Dokument' },
  { keys: ['K'], label: 'Vorheriges Dokument' },
  { keys: ['Enter'], label: 'Dokument öffnen' },
  { keys: ['E'], label: 'Bearbeiten' },
  { keys: ['Entf'], label: 'In den Papierkorb' },
  { keys: ['Strg', 'S'], label: 'Speichern' },
  { keys: ['Esc'], label: 'Zurück / Suche leeren' },
  { keys: ['?'], label: 'Tastaturkürzel anzeigen' }
]
