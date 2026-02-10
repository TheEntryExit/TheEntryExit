import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DIRECTION_OPTIONS = new Set(['Bullish', 'Bearish', 'Any']);
const WICK_OPTIONS = new Set([
  'Ignore',
  'Took previous HIGH',
  'Took previous LOW',
  'Took BOTH previous HIGH & LOW',
  'Took NONE (inside candle)'
]);
const CLOSE_OPTIONS = new Set([
  'Ignore',
  'Closed ABOVE previous HIGH',
  'Closed BELOW previous LOW',
  'Closed INSIDE previous range',
  'Took previous HIGH but CLOSED BELOW previous HIGH',
  'Took previous LOW but CLOSED ABOVE previous LOW'
]);

let candles = [];

function toNumber(value) {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseCsv(content, filename) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const records = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',').map((part) => part.trim());
    if (parts.length < 6) continue;

    const [date, time, openStr, highStr, lowStr, closeStr] = parts;
    const timestamp = new Date(`${date} ${time}`);
    if (Number.isNaN(timestamp.getTime())) continue;

    const open = toNumber(openStr);
    const high = toNumber(highStr);
    const low = toNumber(lowStr);
    const close = toNumber(closeStr);

    if ([open, high, low, close].some(Number.isNaN)) continue;

    records.push({
      source: filename,
      date,
      time,
      timestamp: timestamp.getTime(),
      open,
      high,
      low,
      close
    });
  }

  return records;
}

async function loadCandles() {
  const dataDir = path.join(__dirname, 'data');
  const files = await fs.readdir(dataDir, { withFileTypes: true });
  const csvFiles = files.filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.csv'));

  const loaded = [];

  for (const csvFile of csvFiles) {
    const fullPath = path.join(dataDir, csvFile.name);
    const content = await fs.readFile(fullPath, 'utf8');
    loaded.push(...parseCsv(content, csvFile.name));
  }

  loaded.sort((a, b) => a.timestamp - b.timestamp);
  candles = loaded;
}

function matchesDirection(candle, direction) {
  if (direction === 'Any') return true;
  if (direction === 'Bullish') return candle.close > candle.open;
  if (direction === 'Bearish') return candle.close < candle.open;
  return false;
}

function matchesWickInteraction(current, previousInSequence, wickInteraction) {
  if (wickInteraction === 'Ignore') return true;

  const tookHigh = current.high > previousInSequence.high;
  const tookLow = current.low < previousInSequence.low;

  if (wickInteraction === 'Took previous HIGH') return tookHigh;
  if (wickInteraction === 'Took previous LOW') return tookLow;
  if (wickInteraction === 'Took BOTH previous HIGH & LOW') return tookHigh && tookLow;
  if (wickInteraction === 'Took NONE (inside candle)') return !tookHigh && !tookLow;

  return false;
}

function matchesClosePosition(current, previousInSequence, closePosition) {
  if (closePosition === 'Ignore') return true;

  if (closePosition === 'Closed ABOVE previous HIGH') {
    return current.close > previousInSequence.high;
  }
  if (closePosition === 'Closed BELOW previous LOW') {
    return current.close < previousInSequence.low;
  }
  if (closePosition === 'Closed INSIDE previous range') {
    return current.close <= previousInSequence.high && current.close >= previousInSequence.low;
  }
  if (closePosition === 'Took previous HIGH but CLOSED BELOW previous HIGH') {
    return current.high > previousInSequence.high && current.close < previousInSequence.high;
  }
  if (closePosition === 'Took previous LOW but CLOSED ABOVE previous LOW') {
    return current.low < previousInSequence.low && current.close > previousInSequence.low;
  }

  return false;
}

function isValidStep(step, index) {
  if (!step || typeof step !== 'object') return false;
  if (!DIRECTION_OPTIONS.has(step.direction)) return false;
  if (!WICK_OPTIONS.has(step.wickInteraction)) return false;
  if (!CLOSE_OPTIONS.has(step.closePosition)) return false;
  return true;
}

function analyzeSequence(sequence) {
  let sample = 0;
  let countTakeHigh = 0;
  let countTakeLow = 0;
  let countCloseAboveHigh = 0;
  let countCloseBelowLow = 0;
  let countTookBoth = 0;
  let countTookNone = 0;

  for (let i = 0; i <= candles.length - sequence.length - 1; i += 1) {
    let matched = true;

    for (let seqIndex = 0; seqIndex < sequence.length; seqIndex += 1) {
      const currentCandle = candles[i + seqIndex];
      const rule = sequence[seqIndex];

      if (!matchesDirection(currentCandle, rule.direction)) {
        matched = false;
        break;
      }

      const previousInSequence = seqIndex === 0 ? candles[i - 1] : candles[i + seqIndex - 1];

      // For C1, when there is no candle before sequence start, only Ignore interactions can match.
      if (!previousInSequence) {
        if (rule.wickInteraction !== 'Ignore' || rule.closePosition !== 'Ignore') {
          matched = false;
          break;
        }
      } else {
        if (!matchesWickInteraction(currentCandle, previousInSequence, rule.wickInteraction)) {
          matched = false;
          break;
        }

        if (!matchesClosePosition(currentCandle, previousInSequence, rule.closePosition)) {
          matched = false;
          break;
        }
      }
    }

    if (!matched) continue;

    const anchor = candles[i + sequence.length - 1];
    const next = candles[i + sequence.length];

    if (!next) continue;

    const takeHigh = next.high > anchor.high;
    const takeLow = next.low < anchor.low;
    const closeAboveHigh = next.close > anchor.high;
    const closeBelowLow = next.close < anchor.low;

    sample += 1;
    if (takeHigh) countTakeHigh += 1;
    if (takeLow) countTakeLow += 1;
    if (closeAboveHigh) countCloseAboveHigh += 1;
    if (closeBelowLow) countCloseBelowLow += 1;
    if (takeHigh && takeLow) countTookBoth += 1;
    if (!takeHigh && !takeLow) countTookNone += 1;
  }

  const pct = (count) => (sample === 0 ? 0 : Number(((count / sample) * 100).toFixed(2)));

  return {
    sample,
    probabilities: {
      take_high: pct(countTakeHigh),
      take_low: pct(countTakeLow),
      close_above_high: pct(countCloseAboveHigh),
      close_below_low: pct(countCloseBelowLow),
      took_both: pct(countTookBoth),
      took_none: pct(countTookNone)
    }
  };
}

app.get('/api/status', (_req, res) => {
  res.json({ totalCandles: candles.length });
});

app.post('/api/analyze', (req, res) => {
  const { sequence } = req.body ?? {};

  if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > 4) {
    return res.status(400).json({ error: 'sequence must be an array with 1-4 candles' });
  }

  for (let i = 0; i < sequence.length; i += 1) {
    if (!isValidStep(sequence[i], i)) {
      return res.status(400).json({
        error: `Invalid candle rule at index ${i}`
      });
    }
  }

  const result = analyzeSequence(sequence);
  return res.json(result);
});

loadCandles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Loaded candles: ${candles.length}`);
    });
  })
  .catch((error) => {
    console.error('Failed to load CSV data:', error);
    process.exit(1);
  });
