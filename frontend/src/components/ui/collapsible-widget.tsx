import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { ChevronRight } from 'lucide-react'

const WidgetLayout = createContext<{
  states: Record<string, boolean>
  setStates: Dispatch<SetStateAction<Record<string, boolean>>>
} | null>(null)

/** Keep widget visibility while their date-dependent queries reload. */
export function WidgetLayoutProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, boolean>>({})
  return (
    <WidgetLayout.Provider value={{ states, setStates }}>
      {children}
    </WidgetLayout.Provider>
  )
}

export function CollapsibleWidget({
  title,
  widgetId = title,
  description,
  icon,
  children,
  className = '',
  contentClassName = 'px-5 pb-5',
  defaultOpen = true,
}: {
  title: string
  widgetId?: string
  description?: ReactNode
  icon?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  defaultOpen?: boolean
}) {
  const layout = useContext(WidgetLayout)
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const open = layout?.states[widgetId] ?? localOpen
  function setOpen(next: boolean) {
    if (layout)
      layout.setStates((previous) =>
        previous[widgetId] === next
          ? previous
          : { ...previous, [widgetId]: next },
      )
    else setLocalOpen(next)
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={`min-w-0 self-start rounded-xl border bg-card ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-5 hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        {icon && (
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <span className="mt-0.5 hidden shrink-0 text-xs text-muted-foreground sm:block">
          {open ? 'Replier' : 'Déplier'}
        </span>
      </summary>
      <div className={contentClassName}>{children}</div>
    </details>
  )
}
