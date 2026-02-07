import { useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Home from './pages/Home.jsx';
import Tracker from './pages/Tracker.jsx';
import Breakdown from './pages/Breakdown.jsx';
import { usePftStore } from './store/pftStore.js';

const pages = {
  Home,
  Tracker,
  Breakdown
};

export default function App() {
  const [activePage, setActivePage] = useState('Home');
  const store = usePftStore();

  const ActiveComponent = useMemo(() => pages[activePage], [activePage]);

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="app-content">
        <ActiveComponent store={store} />
      </main>
    </div>
  );
}
