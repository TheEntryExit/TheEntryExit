const statusFile = document.getElementById('status-file');
const statusTotal = document.getElementById('status-total');
const statusRange = document.getElementById('status-range');
const sequenceList = document.getElementById('sequence-list');
const addButton = document.getElementById('add-candle');
const removeButton = document.getElementById('remove-candle');
const runButton = document.getElementById('run-analysis');
const timeframeSelect = document.getElementById('timeframe-select');
const sampleSizeEl = document.getElementById('sample-size');
const directionResults = document.getElementById('direction-results');
const priceActionResults = document.getElementById('price-action-results');
const bodyResults = document.getElementById('body-results');
const candleTemplate = document.getElementById('candle-template');

const bodyBucketLabels = {
  '0-20': '0–20%',
  '20-40': '20–40%',
  '40-60': '40–60%',
  '60-80': '60–80%',
  '80-100': '80–100%'
};

const priceActionLabels = {
  closed_above_c2_high: 'Closed above C2 high',
  closed_above_c1_high: 'Closed above C1 high',
  closed_below_c2_low: 'Closed below C2 low',
  closed_below_c1_low: 'Closed below C1 low',
  took_high_closed_below: 'Took high but closed below',
  took_low_closed_above: 'Took low but closed above',
  took_both_sides: 'Took both sides'
};

function updateResultsList(target, data, labels = {}) {
  target.innerHTML = '';
  Object.entries(data).forEach(([key, value]) => {
    const item = document.createElement('li');
    const label = labels[key] || key;
    item.textContent = `${label}: ${value}%`;
    target.appendChild(item);
  });
}

function updateCandleTitles() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  cards.forEach((card, index) => {
    const title = card.querySelector('.candle-title');
    title.textContent = `Candle ${index + 1}`;
  });
  removeButton.disabled = cards.length <= 1;
}

function createCandleCard() {
  const fragment = candleTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.candle-card');
  const bodyToggle = fragment.querySelector('.body-toggle');
  const bodySelect = fragment.querySelector('.body-select');
  const closeToggle = fragment.querySelector('.close-toggle');
  const closeSelect = fragment.querySelector('.close-select');

  bodyToggle.addEventListener('change', () => {
    bodySelect.disabled = !bodyToggle.checked;
  });
  closeToggle.addEventListener('change', () => {
    closeSelect.disabled = !closeToggle.checked;
  });

  return card;
}

function addCandle() {
  const card = createCandleCard();
  sequenceList.appendChild(card);
  updateCandleTitles();
}

function removeCandle() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  if (cards.length > 1) {
    cards[cards.length - 1].remove();
    updateCandleTitles();
  }
}

function buildSequencePayload() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  return Array.from(cards).map((card) => {
    const direction = card.querySelector('.direction-select').value;
    const bodyToggle = card.querySelector('.body-toggle').checked;
    const closeToggle = card.querySelector('.close-toggle').checked;
    const payload = { direction };
    if (bodyToggle) {
      payload.body_bucket = card.querySelector('.body-select').value;
    }
    if (closeToggle) {
      payload.close_behavior = card.querySelector('.close-select').value;
    }
    return payload;
  });
}

async function loadStatus() {
  const response = await fetch('/api/status');
  const data = await response.json();
  statusFile.textContent = data.file ? `${data.file} loaded` : 'Unavailable';
  statusTotal.textContent = data.totalCandles ?? '-';
  statusRange.textContent = data.start && data.end ? `${data.start} → ${data.end}` : '-';
}

async function runAnalysis() {
  runButton.disabled = true;
  try {
    const payload = {
      timeframe: timeframeSelect.value,
      sequence: buildSequencePayload()
    };
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to run analysis.');
      return;
    }
    const result = await response.json();
    sampleSizeEl.textContent = `Sample size: ${result.sample_size} occurrences`;
    updateResultsList(directionResults, result.direction_probabilities, {
      bullish: 'Bullish',
      bearish: 'Bearish'
    });
    updateResultsList(priceActionResults, result.price_action_probabilities, priceActionLabels);
    updateResultsList(bodyResults, result.body_bucket_distribution, bodyBucketLabels);
  } catch (error) {
    alert('Failed to run analysis.');
  } finally {
    runButton.disabled = false;
  }
}

addButton.addEventListener('click', addCandle);
removeButton.addEventListener('click', removeCandle);
runButton.addEventListener('click', runAnalysis);

addCandle();
loadStatus();
