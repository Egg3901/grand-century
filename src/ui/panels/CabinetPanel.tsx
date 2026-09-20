import { useMemo } from 'react';
import { useStore } from '../../store';
import { AGENDA_FIELDS, deriveNationalAgenda, type AgendaTone } from '../strategy/agenda';
import { useSnapshotFields } from '../useSnapshotFields';
import './CabinetPanel.css';

function toneClass(tone: AgendaTone): string { return `is-${tone}`; }

export function CabinetPanel() {
  const snapshot = useSnapshotFields(AGENDA_FIELDS);
  const openPanelId = useStore((state) => state.openPanelId);
  const agenda = useMemo(() => snapshot ? deriveNationalAgenda(snapshot) : null, [snapshot]);

  if (!agenda) return <section className="panel-card atlas-panel cabinet-panel"><p className="panel-subtle">Gathering dispatches...</p></section>;

  return (
    <section className="panel-card atlas-panel cabinet-panel" data-testid="cabinet-panel">
      <header className="cabinet-brief">
        <p className="cabinet-brief__kicker">National direction</p>
        <h2>{agenda.direction}</h2>
        <p>{agenda.directionDetail}</p>
      </header>

      <section aria-labelledby="cabinet-now">
        <div className="cabinet-section-heading">
          <h3 id="cabinet-now" className="atlas-heading">Before the cabinet now</h3>
          <span>{agenda.headline}</span>
        </div>
        <ol className="cabinet-priorities">
          {agenda.priorities.map((priority, index) => (
            <li key={priority.id} className={toneClass(priority.tone)} data-testid={`cabinet-priority-${priority.id}`}>
              <span className="cabinet-priority__number">{index + 1}</span>
              <div><strong>{priority.title}</strong><p>{priority.detail}</p></div>
              <button type="button" className="btn btn--secondary" onClick={() => openPanelId(priority.destination)}>{priority.action}</button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="cabinet-condition">
        <h3 id="cabinet-condition" className="atlas-heading panel-small-heading">Condition of the nation</h3>
        <div className="cabinet-measures">
          {agenda.measures.map((measure) => (
            <button key={measure.label} type="button" className={toneClass(measure.tone)} onClick={() => openPanelId(measure.destination)}>
              <span>{measure.label}</span><strong>{measure.value}</strong><small>{measure.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="cabinet-arc">
        <h3 id="cabinet-arc" className="atlas-heading panel-small-heading">The campaign arc</h3>
        <div className="cabinet-chapters">
          {agenda.chapters.map((chapter) => {
            const progress = chapter.total > 0 ? chapter.completed / chapter.total : 0;
            return (
              <article key={chapter.title} className={chapter.completed === chapter.total ? 'is-complete' : undefined}>
                <div className="cabinet-chapter__heading"><strong>{chapter.title}</strong><span>{chapter.completed}/{chapter.total}</span></div>
                <div className="cabinet-progress" aria-label={`${chapter.completed} of ${chapter.total} goals complete`}><span style={{ width: `${progress * 100}%` }} /></div>
                <p>{chapter.purpose}</p>
                <ul>
                  {chapter.goals.map((goal) => (
                    <li key={goal.label} className={goal.met ? 'is-met' : undefined}><span aria-hidden="true">{goal.met ? '✓' : '○'}</span>{goal.label}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
