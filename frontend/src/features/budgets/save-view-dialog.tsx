import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  budgetKeys,
  saveView,
  type SavedView,
  type Preset,
  type ViewConfig,
} from './api'
export function SaveViewDialog({
  current,
  preset,
  config,
  first,
  onClose,
  onSaved,
}: {
  current?: SavedView
  preset: Preset
  config: ViewConfig
  first: boolean
  onClose: () => void
  onSaved: (view: SavedView) => void
}) {
  const client = useQueryClient()
  const [name, setName] = useState(current?.name ?? 'Mes budgets')
  const [asNew, setAsNew] = useState(!current)
  const [isDefault, setIsDefault] = useState(current?.is_default ?? first)
  const mutation = useMutation({
    mutationFn: () =>
      saveView(
        { name: name.trim(), preset, config, is_default: isDefault },
        asNew ? undefined : current?.id,
      ),
    onSuccess: async (view) => {
      await client.invalidateQueries({ queryKey: budgetKeys.views })
      onSaved(view)
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>Enregistrer ma vue</DialogTitle>
          <DialogDescription>
            Retrouvez vos filtres et widgets à votre prochaine connexion. La
            période consultée reste indépendante.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="saved-view-name">Nom de la vue</Label>
            <Input
              id="saved-view-name"
              required
              maxLength={100}
              value={name}
              disabled={mutation.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {current && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asNew}
                disabled={mutation.isPending}
                onChange={(event) => setAsNew(event.target.checked)}
              />
              Enregistrer comme nouvelle vue
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              disabled={mutation.isPending}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            Utiliser cette vue par défaut
          </label>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending || !name.trim()}>
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
