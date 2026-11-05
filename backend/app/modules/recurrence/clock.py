from datetime import datetime
from sqlalchemy import text
from app.core.config import settings


async def daily_window(db, now: datetime | None = None):
    """Last scheduled business day and seconds until the next local 06:00."""
    row = (await db.execute(text("""
        WITH instant AS (SELECT coalesce(CAST(:now AS timestamptz), now()) AS current_instant),
        clock AS (SELECT current_instant, timezone(:zone, current_instant) AS local_now FROM instant),
        schedule_window AS (
            SELECT current_instant,
                CASE WHEN local_now::time >= time '06:00'
                    THEN local_now::date ELSE local_now::date - 1 END AS cutoff,
                CASE WHEN local_now::time >= time '06:00'
                    THEN local_now::date + 1 + time '06:00'
                    ELSE local_now::date + time '06:00' END AS next_run
            FROM clock)
        SELECT cutoff, extract(epoch FROM (next_run AT TIME ZONE :zone) - current_instant)
        FROM schedule_window
    """), {"zone": settings.recurrence_timezone, "now": now})).one()
    return row[0], max(1, float(row[1]))
