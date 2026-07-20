import { useStore } from '../store';

const LEGENDS: Record<string, string[]> = {
  political: ['Muted nation colors', 'Dark lines = national borders'],
  ruling_ideology: ['Brown reactionary', 'Blue liberal', 'Red socialist'],
  unrest: ['Darker red = high unrest', 'Lighter tones = calmer states'],
  population: ['Green = needs met', 'Red = deprivation'],
  economy: ['Dark teal = high output', 'Pale teal = low output'],
  military: ['Controller tint overlay', 'Counters show army/fleet stacks'],
  diplomatic: ['Blue self', 'Green allies', 'Red enemies/rivals'],
  cores: ['Green = your owned core states', 'Red = unowned core states'],
};

export function MapLegend() {
  const mapMode = useStore((state) => state.mapMode);
  const lines = LEGENDS[mapMode] ?? LEGENDS.political;
  return (
    <aside className="map-legend atlas-panel">
      <h3 className="atlas-heading">Legend</h3>
      <ul>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </aside>
  );
}

