import { useMemo, useState } from 'react';
import LineChart from '../components/LineChart.jsx';
import { expenseTypes, formatCurrency, groupByDate } from '../store/pftStore.js';

const isWithinRange = (date, from, to) => {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

export default function Home({ store }) {
  const { data } = store;
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredEntries = useMemo(
    () => data.entries.filter((entry) => isWithinRange(entry.date, fromDate, toDate)),
    [data.entries, fromDate, toDate]
  );

  const totals = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => {
        const amount = Number(entry.amount) || 0;
        if (expenseTypes.includes(entry.type)) {
          acc.expenses += amount;
        } else {
          acc.payouts += amount;
        }
        return acc;
      },
      { expenses: 0, payouts: 0 }
    );
  }, [filteredEntries]);

  const net = totals.payouts - totals.expenses;
  const roiPercent = totals.expenses === 0 ? 0 : (net / totals.expenses) * 100;

  const chartData = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  const series = [
    {
      label: 'Expenses',
      points: chartData.map((item, index) => ({
        index,
        value: item.expenses,
        label: item.date
      }))
    },
    {
      label: 'Payouts',
      points: chartData.map((item, index) => ({
        index,
        value: item.payouts,
        label: item.date
      }))
    }
  ];

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Home</h1>
          <p className="page__subtitle">Overview of expenses and payouts.</p>
        </div>
        <div className="filter-row">
          <div className="input-group">
            <label htmlFor="from-date">From</label>
            <input id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label htmlFor="to-date">To</label>
            <input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </header>

      <div className="kpi-grid">
        <div className="kpi-card">
          <p>Total Expenses</p>
          <h2>{formatCurrency(totals.expenses)}</h2>
        </div>
        <div className="kpi-card">
          <p>Total Payouts</p>
          <h2>{formatCurrency(totals.payouts)}</h2>
        </div>
        <div className="kpi-card">
          <p>Net ROI</p>
          <h2>{formatCurrency(net)}</h2>
        </div>
        <div className="kpi-card">
          <p>ROI (%)</p>
          <h2>{roiPercent.toFixed(2)}%</h2>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <h3>Expenses vs Payouts</h3>
          <span className="card__subtitle">Filtered by selected date range.</span>
        </div>
        <LineChart series={series} />
      </div>
    </section>
  );
}
