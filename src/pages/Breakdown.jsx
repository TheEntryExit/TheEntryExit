import { useMemo, useState } from 'react';
import LineChart from '../components/LineChart.jsx';
import { entryTypes, expenseTypes, formatCurrency, groupByMonth } from '../store/pftStore.js';

const isWithinRange = (date, from, to) => {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

export default function Breakdown({ store }) {
  const { data } = store;
  const [typeFilter, setTypeFilter] = useState('expense');
  const [propFirmFilter, setPropFirmFilter] = useState('');
  const [accountSizeFilter, setAccountSizeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredEntries = useMemo(() => {
    return data.entries.filter((entry) => {
      if (!isWithinRange(entry.date, fromDate, toDate)) {
        return false;
      }
      if (typeFilter === 'expense' && !expenseTypes.includes(entry.type)) {
        return false;
      }
      if (typeFilter === 'payout' && entry.type !== 'payout') {
        return false;
      }
      if (propFirmFilter && entry.propFirm !== propFirmFilter) {
        return false;
      }
      if (accountSizeFilter && entry.accountSize !== accountSizeFilter) {
        return false;
      }
      return true;
    });
  }, [data.entries, typeFilter, propFirmFilter, accountSizeFilter, fromDate, toDate]);

  const chartData = useMemo(() => groupByMonth(filteredEntries), [filteredEntries]);

  const totals = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => {
        acc.total += Number(entry.amount) || 0;
        acc.count += 1;
        return acc;
      },
      { total: 0, count: 0 }
    );
  }, [filteredEntries]);

  const average = totals.count === 0 ? 0 : totals.total / totals.count;
  const averagePerMonth = chartData.length === 0 ? 0 : totals.total / chartData.length;

  const series = [
    {
      label: typeFilter === 'payout' ? 'Payouts' : 'Expenses',
      points: chartData.map((item, index) => ({
        index,
        value: typeFilter === 'payout' ? item.payouts : item.expenses,
        label: item.month
      })),
      color: typeFilter === 'payout' ? '#16a34a' : '#f97316'
    }
  ];

  const showMonths = chartData.length > 1;
  const topItems = showMonths
    ? [...chartData]
        .map((item) => ({
          label: item.month,
          value: typeFilter === 'payout' ? item.payouts : item.expenses
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    : [...filteredEntries]
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5)
        .map((entry) => ({
          label: `${entry.date} • ${entry.propFirm}`,
          value: Number(entry.amount)
        }));

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Breakdown</h1>
          <p className="page__subtitle">Slice and compare expenses or payouts.</p>
        </div>
      </header>

      <div className="card">
        <div className="filter-row filter-row--wrap">
          <div className="input-group">
            <label htmlFor="type-filter">Type</label>
            <select id="type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="expense">
                Expenses ({entryTypes.payment}, {entryTypes.reset}, {entryTypes.activation})
              </option>
              <option value="payout">{entryTypes.payout}</option>
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="prop-filter">Prop Firm</label>
            <select id="prop-filter" value={propFirmFilter} onChange={(e) => setPropFirmFilter(e.target.value)}>
              <option value="">All firms</option>
              {data.propFirms.map((firm) => (
                <option key={firm} value={firm}>
                  {firm}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="size-filter">Account Size</label>
            <select
              id="size-filter"
              value={accountSizeFilter}
              onChange={(e) => setAccountSizeFilter(e.target.value)}
            >
              <option value="">All sizes</option>
              {data.accountSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="from-breakdown">From</label>
            <input id="from-breakdown" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label htmlFor="to-breakdown">To</label>
            <input id="to-breakdown" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <p>Total</p>
          <h2>{formatCurrency(totals.total)}</h2>
        </div>
        <div className="kpi-card">
          <p>Average</p>
          <h2>{formatCurrency(average)}</h2>
        </div>
        <div className="kpi-card">
          <p>Count</p>
          <h2>{totals.count}</h2>
        </div>
        <div className="kpi-card">
          <p>Average per month</p>
          <h2>{formatCurrency(averagePerMonth)}</h2>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <h3>{typeFilter === 'payout' ? 'Payout Trend' : 'Expense Trend'}</h3>
          <span className="card__subtitle">Monthly totals based on filters.</span>
        </div>
        <LineChart series={series} />
      </div>

      <div className="card">
        <div className="card__header">
          <h3>Top 5 {showMonths ? 'Months' : 'Entries'}</h3>
          <span className="card__subtitle">Sorted by total amount.</span>
        </div>
        <ol className="top-list">
          {topItems.length === 0 ? (
            <li className="empty-state">No data available for the selected filters.</li>
          ) : (
            topItems.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{formatCurrency(item.value)}</strong>
              </li>
            ))
          )}
        </ol>
      </div>
    </section>
  );
}
