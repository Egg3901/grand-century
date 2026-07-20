import './App.css';
import { GrandMap } from './map/GrandMap';
import { Hud } from './ui/Hud';
import { PanelHost } from './ui/panels/PanelHost';
import { useStore } from './store';

function App() {
  const snapshot = useStore((state) => state.snapshot);
  const data = useStore((state) => state.data);

  return (
    <div className="app-shell">
      <GrandMap />
      <div className="hud-layer">
        <Hud />
        <PanelHost />
      </div>
      {!snapshot || !data ? (
        <div className="loading-veil">
          <h1>Grand Century</h1>
          <p>Initializing simulation ledger...</p>
        </div>
      ) : null}
    </div>
  );
}

export default App;
