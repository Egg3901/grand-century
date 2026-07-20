import { useStore } from '../store';

export function EventFeed() {
  const alerts = useStore((state) => state.alerts);
  const recent = alerts.slice(-3).reverse();
  if (recent.length === 0) return null;
  return (
    <div className="event-feed">
      {recent.map((alert) => (
        <article key={alert.id} className={`event-card atlas-panel event-${alert.kind}`}>
          <strong>{alert.kind.toUpperCase()}</strong>
          <span>{alert.message}</span>
        </article>
      ))}
    </div>
  );
}

