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
const candleTemplate = document.getElementById('candle-template');

const priceActionLabels = {
  close_above_c2_high: 'Closed above C2 high',
  close_below_c2_low: 'Closed below C2 low',
  take_c2_high: 'Took C2 high',
  take_c2_low: 'Took C2 low',
  take_c1_high: 'Took C1 high',
  take_c1_low: 'Took C1 low',
  close_inside_c2: 'Closed inside C2'
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
  removeButton.disabled = cards.length <= 2;
  addButton.disabled = cards.length >= 5;
}

function createCandleCard() {
  const fragment = candleTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.candle-card');
  const directionToggle = fragment.querySelector('.direction-toggle');
  const directionSelect = fragment.querySelector('.direction-select');
  const closePositionToggle = fragment.querySelector('.close-position-toggle');
  const closePositionSelect = fragment.querySelector('.close-position-select');
  const sweepToggle = fragment.querySelector('.sweep-toggle');
  const sweepSelect = fragment.querySelector('.sweep-select');
  const bothToggle = fragment.querySelector('.both-toggle');
  const bothSelect = fragment.querySelector('.both-select');
  const neitherToggle = fragment.querySelector('.neither-toggle');
  const neitherSelect = fragment.querySelector('.neither-select');

  directionToggle.addEventListener('change', () => {
    directionSelect.disabled = !directionToggle.checked;
  });
  closePositionToggle.addEventListener('change', () => {
    closePositionSelect.disabled = !closePositionToggle.checked;
  });
  sweepToggle.addEventListener('change', () => {
    sweepSelect.disabled = !sweepToggle.checked;
  });
  bothToggle.addEventListener('change', () => {
    bothSelect.disabled = !bothToggle.checked;
  });
  neitherToggle.addEventListener('change', () => {
    neitherSelect.disabled = !neitherToggle.checked;
  });

  return card;
}

function addCandle() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  if (cards.length >= 5) {
    return;
  }
  const card = createCandleCard();
  sequenceList.appendChild(card);
  updateCandleTitles();
}

function removeCandle() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  if (cards.length > 2) {
    cards[cards.length - 1].remove();
    updateCandleTitles();
  }
}

function buildSequencePayload() {
  const cards = sequenceList.querySelectorAll('.candle-card');
  return Array.from(cards).map((card, index) => {
    const payload = {};
    const directionToggle = card.querySelector('.direction-toggle').checked;
    const closePositionToggle = card.querySelector('.close-position-toggle').checked;
    const sweepToggle = card.querySelector('.sweep-toggle').checked;
    const bothToggle = card.querySelector('.both-toggle').checked;
    const neitherToggle = card.querySelector('.neither-toggle').checked;

    if (directionToggle) {
      payload.direction = card.querySelector('.direction-select').value;
    }
    if (closePositionToggle) {
      payload.close_position = card.querySelector('.close-position-select').value;
    }
    if (sweepToggle) {
      payload.sweep_close = card.querySelector('.sweep-select').value;
    }
    if (bothToggle) {
      payload.took_both_sides = card.querySelector('.both-select').value === 'true';
    }
    if (neitherToggle) {
      payload.took_neither_side = card.querySelector('.neither-select').value === 'true';
    }

    if (Object.keys(payload).length === 0) {
      throw new Error(`Please select at least one condition for Candle ${index + 1}.`);
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
    let sequence;
    try {
      sequence = buildSequencePayload();
    } catch (error) {
      alert(error.message);
      return;
    }
    const payload = {
      timeframe: timeframeSelect.value,
      sequence
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
    updateResultsList(priceActionResults, result.next_candle_probabilities, priceActionLabels);
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
addCandle();
loadStatus();
