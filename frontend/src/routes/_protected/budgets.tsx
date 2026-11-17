import { createFileRoute } from '@tanstack/react-router'
import { BudgetsPage } from '@/features/budgets/budgets-page'

export const Route = createFileRoute('/_protected/budgets')({
  component: BudgetsPage,
})
