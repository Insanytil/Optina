"""Wallet colors. Kept in sync with WALLET_COLORS in the frontend."""

WALLET_COLORS = (
    "#3b82f6",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#84cc16",
    "#f97316",
    "#64748b",
)


def next_color(used: list[str]) -> str:
    """First palette color nobody uses yet, else the least used one."""
    for color in WALLET_COLORS:
        if color not in used:
            return color
    return min(WALLET_COLORS, key=used.count)
