import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { api, errorMessage } from '@/lib/api'

export function ConfirmTrash({
  id,
  title,
  onOpenChange,
  onDone
}: {
  id: string | null
  title?: string
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  return (
    <AlertDialog open={id !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>In den Papierkorb verschieben?</AlertDialogTitle>
          <AlertDialogDescription>
            {title && <>„{title}“ wird </>}
            {!title && 'Die Datei wird '}
            nach „.ablage/trash“ verschoben und kann wiederhergestellt werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              if (!id) return
              try {
                await api['documents:delete'](id)
                toast.success('In den Papierkorb verschoben')
                onDone?.()
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            Verschieben
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
