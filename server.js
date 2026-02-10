import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function parseNumber(value) {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

function parseCsv(content, source) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const parsed = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = lines[i].split(',').map((s) => s.trim());
    if (row.length < 6) continue;

    const [date, time, openRaw, highRaw, lowRaw, closeRaw] = row;
    const timestamp = new Date(`${date} ${time}`);

    if (Number.isNaN(timestamp.getTime())) continue;

    const open = parseNumber(openRaw);
    const high = parseNumber(highRaw);
    const low = parseNumber(lowRaw);
    const close = parseNumber(closeRaw);

    if ([open, high, low, close].some(Number.isNaN)) continue;

    parsed.push({
      source,
      date,
      time,
      timestamp: timestamp.getTime(),
      open,
      high,
      low,
      close
    });
  }

  return parsed;
}

async function loadAllCandles() {
  const dataDir = path.join(__dirname, 'data');
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const csvFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'));

  const merged = [];
  for (const file of csvFiles) {
    const filePath = path.join(dataDir, file.name);
    const content = await fs.readFile(filePath, 'utf8');
    merged.push(...parseCsv(content, file.name));
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);
  candles = merged;
}

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  return (
    DIRECTION_OPTIONS.has(rule.direction) &&
    WICK_OPTIONS.has(rule.wickInteraction) &&
    CLOSE_OPTIONS.has(rule.closePosition)
  );
}

function matchesDirection(candle, direction) {
  if (direction === 'Any') return true;
  if (direction === 'Bullish') return candle.close > candle.open;
  if (direction === 'Bearish') return candle.close < candle.open;
  return false;
}

function matchesWickInteraction(current, previousInSequence, selected) {
  if (selected === 'Ignore') return true;

  const tookHigh = current.high > previousInSequence.high;
  const tookLow = current.low < previousInSequence.low;

  if (selected === 'Took previous HIGH') return tookHigh;
  if (selected === 'Took previous LOW') return tookLow;
  if (selected === 'Took BOTH previous HIGH & LOW') return tookHigh && tookLow;
  if (selected === 'Took NONE (inside candle)') return !tookHigh && !tookLow;

  return false;
}

function matchesClosePosition(current, previousInSequence, selected) {
  if (selected === 'Ignore') return true;

  if (selected === 'Closed ABOVE previous HIGH') return current.close > previousInSequence.high;
  if (selected === 'Closed BELOW previous LOW') return current.close < previousInSequence.low;
  if (selected === 'Closed INSIDE previous range') {
    return current.close >= previousInSequence.low && current.close <= previousInSequence.high;
  }
  if (selected === 'Took previous HIGH but CLOSED BELOW previous HIGH') {
    return current.high > previousInSequence.high && current.close < previousInSequence.high;
  }
  if (selected === 'Took previous LOW but CLOSED ABOVE previous LOW') {
    return current.low < previousInSequence.low && current.close > previousInSequence.low;
  }

  return false;
}

function analyzeSequence(sequence) {
  let sample = 0;
  let takeHighHits = 0;
  let takeLowHits = 0;
  let closeAboveHighHits = 0;
  let closeBelowLowHits = 0;
  let tookBothHits = 0;
  let tookNoneHits = 0;

  const lastStartIndex = candles.length - sequence.length - 1;

  for (let start = 0; start <= lastStartIndex; start += 1) {
    let sequenceMatched = true;

    for (let seqIdx = 0; seqIdx < sequence.length; seqIdx += 1) {
      const current = candles[start + seqIdx];
      const currentRule = sequence[seqIdx];

      if (!matchesDirection(current, currentRule.direction)) {
        sequenceMatched = false;
        break;
      }

      const previousInSequence = seqIdx === 0 ? candles[start - 1] : candles[start + seqIdx - 1];

      if (!previousInSequence) {
        if (currentRule.wickInteraction !== 'Ignore' || currentRule.closePosition !== 'Ignore') {
          sequenceMatched = false;
          break;
        }
      } else {
        if (!matchesWickInteraction(current, previousInSequence, currentRule.wickInteraction)) {
          sequenceMatched = false;
          break;
        }
        if (!matchesClosePosition(current, previousInSequence, currentRule.closePosition)) {
          sequenceMatched = false;
          break;
        }
      }
    }

    if (!sequenceMatched) continue;

    const anchor = candles[start + sequence.length - 1];
    const next = candles[start + sequence.length];

    if (!next) continue;

    const takeHigh = next.high > anchor.high;
    const takeLow = next.low < anchor.low;
    const closeAboveHigh = next.close > anchor.high;
    const closeBelowLow = next.close < anchor.low;

    sample += 1;
    if (takeHigh) takeHighHits += 1;
    if (takeLow) takeLowHits += 1;
    if (closeAboveHigh) closeAboveHighHits += 1;
    if (closeBelowLow) closeBelowLowHits += 1;
    if (takeHigh && takeLow) tookBothHits += 1;
    if (!takeHigh && !takeLow) tookNoneHits += 1;
  }

  const percent = (count) => (sample === 0 ? 0 : Number(((count / sample) * 100).toFixed(2)));

  return {
    sample,
    probabilities: {
      take_high: percent(takeHighHits),
      take_low: percent(takeLowHits),
      close_above_high: percent(closeAboveHighHits),
      close_below_low: percent(closeBelowLowHits),
      took_both: percent(tookBothHits),
      took_none: percent(tookNoneHits)
    }
  };
}

app.get('/api/status', (_req, res) => {
  res.json({ totalCandles: candles.length });
});

app.post('/api/analyze', (req, res) => {
  const { sequence } = req.body ?? {};

  if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > 4) {
    return res.status(400).json({ error: 'sequence must be an array with length 1 to 4' });
  }

  for (let i = 0; i < sequence.length; i += 1) {
    if (!validateRule(sequence[i])) {
      return res.status(400).json({ error: `Invalid sequence rule at index ${i}` });
    }
  }

  return res.json(analyzeSequence(sequence));
});

loadAllCandles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Loaded candles: ${candles.length}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start app:', err);
    process.exit(1);
  });
