import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { streakDays } from '../../src/core/habits';
import { shareCardModel } from '../../src/dashboard/shareCard';
import { Dashboard, type DashboardView } from './Dashboard';
import { ShareCardDialog } from './ShareCardDialog';
import './style.css';

function ShareButton({ view }: { view: DashboardView }) {
  const [open, setOpen] = useState(false);
  const { data, settings, daily } = view;
  const model = useMemo(
    () => shareCardModel(data, streakDays(daily, settings.dailyBudgetPct, Date.now()), settings.shareShowProjects),
    [data, daily, settings.dailyBudgetPct, settings.shareShowProjects],
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Share card
      </button>
      {open && <ShareCardDialog model={model} showProjects={settings.shareShowProjects} onClose={() => setOpen(false)} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Dashboard actions={(view) => <ShareButton view={view} />} />);
