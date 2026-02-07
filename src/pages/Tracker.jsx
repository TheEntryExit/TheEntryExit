import { useMemo, useState } from 'react';
import { entryTypes } from '../store/pftStore.js';

const entryOptions = [
  { value: 'payment', label: entryTypes.payment },
  { value: 'reset', label: entryTypes.reset },
  { value: 'activation', label: entryTypes.activation },
  { value: 'payout', label: entryTypes.payout }
];

export default function Tracker({ store }) {
  const { data, addEntry } = store;
  const [formState, setFormState] = useState({
    date: '',
    type: 'payment',
    propFirm: '',
    accountNumber: '',
    accountSize: data.accountSizes[0] || '',
    accountSizeOther: '',
    amount: ''
  });

  const isPayment = formState.type === 'payment';
  const propFirmOptions = data.propFirms;
  const showPropFirmDropdown = !isPayment && propFirmOptions.length > 0;
  const propFirmValue = showPropFirmDropdown ? formState.propFirm : formState.propFirm;

  const accountsForFirm = useMemo(
    () => (propFirmValue ? data.accounts[propFirmValue] || [] : []),
    [data.accounts, propFirmValue]
  );

  const showAccountDropdown = !isPayment && accountsForFirm.length > 0;

  const accountSizeOptions = [...data.accountSizes, 'Other'];
  const showAccountSizeOther = formState.accountSize === 'Other';
  const resolvedAccountSize = showAccountSizeOther ? formState.accountSizeOther : formState.accountSize;

  const updateField = (field) => (event) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const propFirm = (showPropFirmDropdown ? formState.propFirm : formState.propFirm).trim();
    const accountNumber = (showAccountDropdown ? formState.accountNumber : formState.accountNumber).trim();
    const accountSize = resolvedAccountSize.trim();

    if (!formState.date || !formState.type || !propFirm || !accountNumber || !accountSize || !formState.amount) {
      return;
    }

    addEntry({
      id: crypto.randomUUID(),
      date: formState.date,
      type: formState.type,
      propFirm,
      accountNumber,
      amount: Number(formState.amount),
      accountSize
    });

    setFormState((prev) => ({
      ...prev,
      amount: '',
      propFirm: '',
      accountNumber: '',
      accountSize: data.accountSizes[0] || '5k',
      accountSizeOther: ''
    }));
  };

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Tracker</h1>
          <p className="page__subtitle">Add new payments, fees, and payouts.</p>
        </div>
      </header>

      <div className="card">
        <h3>New Entry</h3>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="entry-date">Date</label>
            <input id="entry-date" type="date" value={formState.date} onChange={updateField('date')} required />
          </div>

          <div className="input-group">
            <label htmlFor="entry-type">Type</label>
            <select id="entry-type" value={formState.type} onChange={updateField('type')}>
              {entryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="prop-firm">Prop Firm</label>
            {showPropFirmDropdown ? (
              <select id="prop-firm" value={formState.propFirm} onChange={updateField('propFirm')} required>
                <option value="">Select firm</option>
                {propFirmOptions.map((firm) => (
                  <option key={firm} value={firm}>
                    {firm}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="prop-firm"
                type="text"
                value={formState.propFirm}
                onChange={updateField('propFirm')}
                placeholder="Enter prop firm"
                required
              />
            )}
          </div>

          <div className="input-group">
            <label htmlFor="account-number">Account Number</label>
            {showAccountDropdown ? (
              <select
                id="account-number"
                value={formState.accountNumber}
                onChange={updateField('accountNumber')}
                required
              >
                <option value="">Select account</option>
                {accountsForFirm.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="account-number"
                type="text"
                value={formState.accountNumber}
                onChange={updateField('accountNumber')}
                placeholder="Enter account number"
                required
              />
            )}
          </div>

          <div className="input-group">
            <label htmlFor="account-size">Account Size</label>
            <select id="account-size" value={formState.accountSize} onChange={updateField('accountSize')}>
              {accountSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            {showAccountSizeOther && (
              <input
                type="text"
                value={formState.accountSizeOther}
                onChange={updateField('accountSizeOther')}
                placeholder="Custom size"
                required
              />
            )}
          </div>

          <div className="input-group">
            <label htmlFor="amount">Amount ($)</label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={formState.amount}
              onChange={updateField('amount')}
              required
            />
          </div>

          <div className="input-group input-group--full">
            <button type="submit" className="primary-button">
              Save Entry
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card__header">
          <h3>All Entries</h3>
          <span className="card__subtitle">Newest first.</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Prop Firm</th>
                <th>Account</th>
                <th>Size</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No entries yet. Add one above.
                  </td>
                </tr>
              ) : (
                data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>{entryTypes[entry.type]}</td>
                    <td>{entry.propFirm}</td>
                    <td>{entry.accountNumber}</td>
                    <td>{entry.accountSize}</td>
                    <td>${Number(entry.amount).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
