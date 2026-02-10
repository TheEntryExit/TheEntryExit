const DIRECTION_OPTIONS = ['Bullish', 'Bearish', 'Any'];
const WICK_OPTIONS = [
  'Ignore',
  'Took previous HIGH',
  'Took previous LOW',
  'Took BOTH previous HIGH & LOW',
  'Took NONE (inside candle)'
];
const CLOSE_OPTIONS = [
  'Ignore',
  'Closed ABOVE previous HIGH',
  'Closed BELOW previous LOW',
  'Closed INSIDE previous range',
  'Took previous HIGH but CLOSED BELOW previous HIGH',
  'Took previous LOW but CLOSED ABOVE previous LOW'
];

const sequenceContainer = document.getElementById('sequenceContainer');
const visualCandles = document.getElementById('visualCandles');
const probabilityGrid = document.getElementById('probabilityGrid');
const sampleValue = document.getElementById('sampleValue');
const errorText = document.getElementById('errorText');
const statusText = document.getElementById('statusText');

const addCandleBtn = document.getElementById('addCandleBtn');
const removeCandleBtn = document.getElementById('removeCandleBtn');
const runAnalysisBtn = document.getElementById('runAnalysisBtn');

const probabilityKeys = [
  'take_high',
  'take_low',
  'close_above_high',
  'close_below_low',
  'took_both',
  'took_none'
];

let sequence = [
  {
    direction: 'Any',
    wickInteraction: 'Ignore',
    closePosition: 'Ignore'
  }
];

let latestResult = null;

function selectOptions(values, selected) {
  return values
    .map((option) => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`)
    .join('');
}

function directionClass(direction) {
  if (direction === 'Bullish') return 'bullish';
  if (direction === 'Bearish') return 'bearish';
  return 'any';
}

function renderSequenceBuilder() {
  sequenceContainer.innerHTML = '';

  sequence.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'candle-config';
    item.innerHTML = `
      <h3>C${index + 1}</h3>
      <div class="field">
        <label>Direction</label>
        <select data-index="${index}" data-field="direction">
          ${selectOptions(DIRECTION_OPTIONS, rule.direction)}
        </select>
      </div>
      <div class="field">
        <label>Wick interaction with PREVIOUS candle</label>
        <select data-index="${index}" data-field="wickInteraction">
          ${selectOptions(WICK_OPTIONS, rule.wickInteraction)}
        </select>
      </div>
      <div class="field">
        <label>Close position relative to PREVIOUS candle</label>
        <select data-index="${index}" data-field="closePosition">
          ${selectOptions(CLOSE_OPTIONS, rule.closePosition)}
        </select>
      </div>
    `;

    sequenceContainer.appendChild(item);
  });

  sequenceContainer.querySelectorAll('select').forEach((selectEl) => {
    selectEl.addEventListener('change', (event) => {
      const idx = Number(event.target.dataset.index);
      const field = event.target.dataset.field;
      sequence[idx][field] = event.target.value;
      renderVisual();
    });
  });

  addCandleBtn.disabled = sequence.length >= 4;
  removeCandleBtn.disabled = sequence.length <= 1;

  renderVisual();
}

function nextBias() {
  if (!latestResult?.probabilities) return 'No analysis yet';
  const high = latestResult.probabilities.take_high;
  const low = latestResult.probabilities.take_low;
  if (high > low) return 'Highest probability: take ANCHOR high';
  if (low > high) return 'Highest probability: take ANCHOR low';
  return 'Equal probability for high/low take';
}

function renderVisual() {
  visualCandles.innerHTML = '';

  sequence.forEach((rule, index) => {
    const cls = directionClass(rule.direction);
    const card = document.createElement('div');
    card.className = `visual-card ${cls}`;
    const isAnchor = index === sequence.length - 1;

    card.innerHTML = `
      <div><strong>C${index + 1}</strong></div>
      <div>${rule.direction}</div>
      <div class="candle-drawing ${cls}">
        <span class="wick top"></span>
        <span class="body"></span>
        <span class="wick bottom"></span>
      </div>
      <div class="ohlc">O / H / L / C</div>
      ${isAnchor ? '<span class="tag">ANCHOR</span>' : ''}
    `;

    visualCandles.appendChild(card);
  });

  const next = document.createElement('div');
  next.className = 'visual-card any';
  next.innerHTML = `
    <div><strong>NEXT</strong></div>
    <div>${nextBias()}</div>
    <div class="candle-drawing any">
      <span class="wick top"></span>
      <span class="body"></span>
      <span class="wick bottom"></span>
    </div>
    <div class="ohlc">O / H / L / C</div>
    <span class="tag">Compared to ANCHOR</span>
  `;
  visualCandles.appendChild(next);
}

function renderProbabilities(probabilities) {
  probabilityGrid.innerHTML = '';

  probabilityKeys.forEach((key) => {
    const card = document.createElement('div');
    card.className = 'prob-card';
    card.innerHTML = `
      <div class="key">${key}</div>
      <div class="value">${probabilities ? `${probabilities[key]}%` : '-'}</div>
    `;
    probabilityGrid.appendChild(card);
  });
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    statusText.textContent = `Total candles loaded: ${data.totalCandles}`;
  } catch {
    statusText.textContent = 'Unable to load status';
  }
}

async function runAnalysis() {
  errorText.textContent = '';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence })
    });

    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Analysis failed');
    }

    latestResult = payload;
    sampleValue.textContent = payload.sample;
    renderProbabilities(payload.probabilities);
    renderVisual();
  } catch (err) {
    latestResult = null;
    sampleValue.textContent = '-';
    renderProbabilities(null);
    renderVisual();
    errorText.textContent = err.message;
  }
}

addCandleBtn.addEventListener('click', () => {
  if (sequence.length >= 4) return;
  sequence.push({
    direction: 'Any',
    wickInteraction: 'Ignore',
    closePosition: 'Ignore'
  });
  renderSequenceBuilder();
});

removeCandleBtn.addEventListener('click', () => {
  if (sequence.length <= 1) return;
  sequence = sequence.slice(0, -1);
  renderSequenceBuilder();
});

runAnalysisBtn.addEventListener('click', runAnalysis);

renderSequenceBuilder();
renderProbabilities(null);
loadStatus();
