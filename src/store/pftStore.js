import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pft_data';

const defaultData = {
  entries: [],
  propFirms: [],
  accounts: {},
  accountSizes: ['5k', '10k', '25k', '50k', '100k', '200k', '300k', '400k']
};

const normalizeString = (value) => value.trim();

const uniqueList = (items) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return defaultData;
  }
  try {
    const parsed = JSON.parse(stored);
    return {
      ...defaultData,
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : defaultData.entries,
      propFirms: Array.isArray(parsed.propFirms) ? parsed.propFirms : defaultData.propFirms,
      accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : defaultData.accounts,
      accountSizes: Array.isArray(parsed.accountSizes) ? parsed.accountSizes : defaultData.accountSizes
    };
  } catch (error) {
    return defaultData;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function usePftStore() {
  const [data, setData] = useState(() => loadData());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const addEntry = (entry) => {
    setData((prev) => {
      const propFirm = normalizeString(entry.propFirm);
      const accountNumber = normalizeString(entry.accountNumber);
      const accountSize = normalizeString(entry.accountSize);

      const updatedPropFirms = uniqueList([...prev.propFirms, propFirm]);

      const existingAccounts = prev.accounts[propFirm] || [];
      const updatedAccounts = uniqueList([...existingAccounts, accountNumber]);

      const updatedAccountSizes = uniqueList([...prev.accountSizes, accountSize]);

      return {
        ...prev,
        entries: [entry, ...prev.entries],
        propFirms: updatedPropFirms,
        accounts: {
          ...prev.accounts,
          [propFirm]: updatedAccounts
        },
        accountSizes: updatedAccountSizes
      };
    });
  };

  return { data, addEntry, setData };
}

export const entryTypes = {
  payment: 'Payment',
  reset: 'Reset Fee',
  activation: 'Activation Fee',
  payout: 'Payout'
};

export const expenseTypes = ['payment', 'reset', 'activation'];

export const formatCurrency = (value) => {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(3)}M`;
  }
  if (absValue >= 1_000) {
    return `$${(value / 1_000).toFixed(3)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export const groupByDate = (entries) => {
  const buckets = {};
  entries.forEach((entry) => {
    if (!entry.date) {
      return;
    }
    buckets[entry.date] = buckets[entry.date] || { expenses: 0, payouts: 0 };
    if (entry.type === 'payout') {
      buckets[entry.date].payouts += Number(entry.amount) || 0;
    } else {
      buckets[entry.date].expenses += Number(entry.amount) || 0;
    }
  });
  return Object.entries(buckets)
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const groupByMonth = (entries) => {
  const buckets = {};
  entries.forEach((entry) => {
    if (!entry.date) {
      return;
    }
    const [year, month] = entry.date.split('-');
    const key = `${year}-${month}`;
    buckets[key] = buckets[key] || { expenses: 0, payouts: 0 };
    if (entry.type === 'payout') {
      buckets[key].payouts += Number(entry.amount) || 0;
    } else {
      buckets[key].expenses += Number(entry.amount) || 0;
    }
  });
  return Object.entries(buckets)
    .map(([month, values]) => ({ month, ...values }))
    .sort((a, b) => a.month.localeCompare(b.month));
};
