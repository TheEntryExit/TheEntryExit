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

let sequenceState = [
  {
    direction: 'Any',
    wickInteraction: 'Ignore',
    closePosition: 'Ignore'
  }
];

let lastAnalysis = null;

const probabilityLabels = {
  take_high: 'take_high',
  take_low: 'take_low',
  close_above_high: 'close_above_high',
  close_below_low: 'close_below_low',
  took_both: 'took_both',
  took_none: 'took_none'
};

function createOptions(options, selected) {
  return options
    .map((option) => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`)
    .join('');
}

function renderSequenceBuilder() {
  sequenceContainer.innerHTML = '';

  sequenceState.forEach((candle, index) => {
    const block = document.createElement('div');
    block.className = 'candle-config';

    block.innerHTML = `
      <h3>C${index + 1}</h3>
      <div class="field-row">
        <label for="direction-${index}">Direction</label>
        <select id="direction-${index}" data-index="${index}" data-field="direction">
          ${createOptions(DIRECTION_OPTIONS, candle.direction)}
        </select>
      </div>
      <div class="field-row">
        <label for="wick-${index}">Wick interaction with PREVIOUS candle</label>
        <select id="wick-${index}" data-index="${index}" data-field="wickInteraction">
          ${createOptions(WICK_OPTIONS, candle.wickInteraction)}
        </select>
      </div>
      <div class="field-row">
        <label for="close-${index}">Close position relative to PREVIOUS candle</label>
        <select id="close-${index}" data-index="${index}" data-field="closePosition">
          ${createOptions(CLOSE_OPTIONS, candle.closePosition)}
        </select>
      </div>
    `;

    sequenceContainer.appendChild(block);
  });

  sequenceContainer.querySelectorAll('select').forEach((selectEl) => {
    selectEl.addEventListener('change', (event) => {
      const idx = Number(event.target.dataset.index);
      const field = event.target.dataset.field;
      sequenceState[idx][field] = event.target.value;
      renderVisual();
    });
  });

  removeCandleBtn.disabled = sequenceState.length === 1;
  addCandleBtn.disabled = sequenceState.length === 4;

  renderVisual();
}

function getDirectionClass(direction) {
  if (direction === 'Bullish') return 'bullish';
  if (direction === 'Bearish') return 'bearish';
  return 'any';
}

function renderVisual() {
  visualCandles.innerHTML = '';

  let nextBias = 'Balanced';
  if (lastAnalysis?.probabilities) {
    const { take_high: takeHigh, take_low: takeLow } = lastAnalysis.probabilities;
    if (takeHigh > takeLow) nextBias = 'Likely takes ANCHOR high';
    if (takeLow > takeHigh) nextBias = 'Likely takes ANCHOR low';
  }

  sequenceState.forEach((candle, index) => {
    const div = document.createElement('div');
    div.className = `visual-box ${getDirectionClass(candle.direction)}`;
    const isAnchor = index === sequenceState.length - 1;

    div.innerHTML = `
      <div><strong>C${index + 1}</strong></div>
      <div>${candle.direction}</div>
      <div class="candle-shape ${getDirectionClass(candle.direction)}">
        <span class="wick wick-top"></span>
        <span class="body"></span>
        <span class="wick wick-bottom"></span>
      </div>
      <div class="ohlc-labels">H / O / C / L</div>
      ${isAnchor ? '<span class="tag">ANCHOR</span>' : ''}
    `;

    visualCandles.appendChild(div);
  });

  const nextDiv = document.createElement('div');
  nextDiv.className = 'visual-box any next';
  nextDiv.innerHTML = `
    <div><strong>NEXT</strong></div>
    <div>${nextBias}</div>
    <div class="candle-shape any">
      <span class="wick wick-top"></span>
      <span class="body"></span>
      <span class="wick wick-bottom"></span>
    </div>
    <div class="ohlc-labels">H / O / C / L</div>
    <span class="tag">Compared vs ANCHOR</span>
  `;
  visualCandles.appendChild(nextDiv);
}

function renderProbabilities(probabilities = null) {
  probabilityGrid.innerHTML = '';

  Object.keys(probabilityLabels).forEach((key) => {
    const value = probabilities ? `${probabilities[key]}%` : '-';
    const card = document.createElement('div');
    card.className = 'prob-card';
    card.innerHTML = `
      <div class="name">${probabilityLabels[key]}</div>
      <div class="value">${value}</div>
    `;
    probabilityGrid.appendChild(card);
  });
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    statusText.textContent = `Loaded candles: ${data.totalCandles}`;
  } catch {
    statusText.textContent = 'Unable to load status';
  }
}

async function runAnalysis() {
  errorText.textContent = '';

  const payload = {
    sequence: sequenceState
  };

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Analysis failed');
    }

    sampleValue.textContent = data.sample;
    lastAnalysis = data;
    renderProbabilities(data.probabilities);
    renderVisual();
  } catch (err) {
    sampleValue.textContent = '-';
    lastAnalysis = null;
    renderProbabilities(null);
    errorText.textContent = err.message;
    renderVisual();
  }
}

addCandleBtn.addEventListener('click', () => {
  if (sequenceState.length >= 4) return;
  sequenceState.push({
    direction: 'Any',
    wickInteraction: 'Ignore',
    closePosition: 'Ignore'
  });
  renderSequenceBuilder();
});

removeCandleBtn.addEventListener('click', () => {
  if (sequenceState.length <= 1) return;
  sequenceState = sequenceState.slice(0, -1);
  renderSequenceBuilder();
});

runAnalysisBtn.addEventListener('click', runAnalysis);

renderSequenceBuilder();
renderProbabilities();
loadStatus();
