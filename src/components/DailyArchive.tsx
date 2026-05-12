import { useMemo } from 'react';
import { goToDailyScreen, goToPicker } from '../game/gameLoop';
import { loadDailyHistory } from '../lib/storage';

const ARCHIVE_WINDOW_DAYS = 30;

/** YYYY-MM-DD string for `daysAgo` days before today, UTC. */
function dateStringDaysAgo(daysAgo: number): string {
  const now = new Date();
  // Build a UTC date by adding days, then format the same way as
  // todayUtcDateString does so the seed matches generateDailyPattern.
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo);
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  // Build a Date from the UTC components to avoid timezone shifts when
  // formatting (the daily challenge is UTC-anchored).
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DailyArchive() {
  const history = useMemo(() => loadDailyHistory(), []);
  // Skip today (handled by the regular Daily screen) and walk back from
  // yesterday for the configured window.
  const days = useMemo(() => {
    const list: string[] = [];
    for (let i = 1; i <= ARCHIVE_WINDOW_DAYS; i++) list.push(dateStringDaysAgo(i));
    return list;
  }, []);

  return (
    <div className="screen screen--archive">
      <h2 className="subtitle">Past Challenges</h2>
      <ul className="archive-list">
        {days.map((d) => {
          const entry = history.entries[d];
          const label = formatDateLabel(d);
          return (
            <li key={d}>
              <button
                className={`archive-row ${entry ? 'archive-row--played' : ''}`}
                type="button"
                onClick={() => goToDailyScreen(d)}
              >
                <span className="archive-row__date">
                  <span className="archive-row__day">{label}</span>
                  <span className="archive-row__iso">{d}</span>
                </span>
                {entry ? (
                  <span className="archive-row__score">
                    <span className="archive-row__total">{entry.result.totalScore}</span>
                    <span className="archive-row__sub">
                      {entry.result.rhythmScore}r / {entry.result.tempoScore}t
                    </span>
                  </span>
                ) : (
                  <span className="archive-row__cta">Play</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn" type="button" onClick={goToPicker}>
        Back
      </button>
    </div>
  );
}
