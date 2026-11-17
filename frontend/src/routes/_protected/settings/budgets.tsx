import { createFileRoute } from '@tanstack/react-router'
import { BudgetManagementPage } from '@/features/budgets/budget-management-page'

export const Route = createFileRoute('/_protected/settings/budgets')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { edit?: string; create?: boolean; duplicate?: boolean } => ({
    edit:
      typeof search.edit === 'string' && /^[0-9a-f-]{36}$/i.test(search.edit)
        ? search.edit
        : undefined,
    create:
      search.create === true || search.create === 'true' ? true : undefined,
    duplicate:
      search.duplicate === true || search.duplicate === 'true'
        ? true
        : undefined,
  }),
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  return (
    <BudgetManagementPage
      editId={search.edit}
      create={search.create}
      duplicate={search.duplicate}
    />
  )
}
