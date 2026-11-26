import { createFileRoute } from '@tanstack/react-router'
import { BudgetSettingsPage } from '@/features/budgets/budget-settings-page'

export const Route = createFileRoute('/_protected/settings/budgets')({
  component: BudgetSettingsPage,
})
