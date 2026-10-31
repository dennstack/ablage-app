import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { shortcutList } from '@/lib/hotkeys'

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tastaturkürzel</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {shortcutList.map(({ keys, label }) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span>{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
