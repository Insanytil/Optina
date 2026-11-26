import { Check, Pipette } from 'lucide-react'
import { WALLET_COLORS } from '@/features/calendar/calendar-model'
import { cn } from 'cn'

const NAMES: Record<string, string> = {
  '#3b82f6': 'Bleu',
  '#f59e0b': 'Ambre',
  '#8b5cf6': 'Violet',
  '#06b6d4': 'Cyan',
  '#ec4899': 'Rose',
  '#84cc16': 'Vert',
  '#f97316': 'Orange',
  '#64748b': 'Ardoise',
}

/** Dark check on light colors, white on dark ones. */
const checkColor = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111827' : '#ffffff'
}

const swatchClass =
  'relative flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed motion-reduce:transition-none'

/**
 * Palette swatches plus a free color, as a radio group; `used` marks palette
 * colors other wallets already have.
 */
export function WalletColorPicker({
  value,
  onChange,
  used,
  disabled,
}: {
  value: string
  onChange: (color: string) => void
  used: string[]
  disabled?: boolean
}) {
  const custom = !(WALLET_COLORS as readonly string[]).includes(value)
  return (
    <div
      role="radiogroup"
      aria-label="Couleur"
      className="flex flex-wrap items-center gap-2"
    >
      {WALLET_COLORS.map((color) => {
        const selected = color === value
        const taken = used.includes(color) && !selected
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${NAMES[color]}${taken ? ', déjà utilisée' : ''}`}
            title={
              taken ? 'Déjà utilisée par un autre portefeuille' : NAMES[color]
            }
            disabled={disabled}
            onClick={() => onChange(color)}
            className={cn(swatchClass, selected && 'ring-2 ring-foreground')}
            style={{ backgroundColor: color }}
          >
            {selected && (
              <Check
                className="size-4"
                style={{ color: checkColor(color) }}
                aria-hidden="true"
              />
            )}
            {taken && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-foreground/60"
              />
            )}
          </button>
        )
      })}
      {/* Free color: a native picker behind a swatch showing the current choice. */}
      <label
        role="radio"
        aria-checked={custom}
        title="Couleur personnalisée"
        className={cn(
          swatchClass,
          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          custom
            ? 'ring-2 ring-foreground'
            : 'border border-dashed border-muted-foreground/60 text-muted-foreground',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={custom ? { backgroundColor: value } : undefined}
      >
        <span className="sr-only">Couleur personnalisée</span>
        {custom ? (
          <Check
            className="size-4"
            style={{ color: checkColor(value) }}
            aria-hidden="true"
          />
        ) : (
          <Pipette className="size-4" aria-hidden="true" />
        )}
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      {custom && (
        <span className="font-mono text-xs text-muted-foreground uppercase">
          {value}
        </span>
      )}
    </div>
  )
}
