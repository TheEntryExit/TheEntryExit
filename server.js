import fs from 'fs';
import path from 'path';
import express from 'express';

const PORT = 3001;
const DATA_PATH = path.join(process.cwd(), 'data', 'data.csv');

if (!fs.existsSync(DATA_PATH)) {
  throw new Error(`Required data file missing at ${DATA_PATH}`);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\.(\d{3})\d*Z$/, '.$1Z');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function parseCsv(data) {
  const lines = data.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const header = lines[0].split(',').map((entry) => entry.trim());
  const normalizedHeader = header.map((entry) => entry.toLowerCase().replace(/\s+/g, ''));
  const indexMap = {
    date: normalizedHeader.indexOf('date'),
    time: normalizedHeader.indexOf('time'),
    open: normalizedHeader.indexOf('open'),
    high: normalizedHeader.indexOf('high'),
    low: normalizedHeader.indexOf('low'),
    close: normalizedHeader.indexOf('close')
  };
  const missingColumns = Object.entries(indexMap)
    .filter(([, value]) => value === -1)
    .map(([key]) => key);
  if (missingColumns.length > 0) {
    throw new Error(`CSV missing required columns: ${missingColumns.join(', ')}`);
  }
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    const date = parts[indexMap.date]?.trim() ?? '';
    const time = parts[indexMap.time]?.trim() ?? '';
    const timestamp = parseTimestamp(time ? `${date}T${time}` : date);
    return {
      timestamp,
      open: Number(parts[indexMap.open]),
      high: Number(parts[indexMap.high]),
      low: Number(parts[indexMap.low]),
      close: Number(parts[indexMap.close])
    };
  }).filter((row) => row.timestamp);
}

function normalizeCandles(candles) {
  if (candles.length === 0) {
    return [];
  }
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const normalized = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = normalized[normalized.length - 1];
    const current = sorted[i];
    const diffMinutes = Math.round((current.timestamp - prev.timestamp) / 60000);
    if (diffMinutes <= 0) {
      continue;
    }
    if (diffMinutes > 1) {
      for (let gap = 1; gap < diffMinutes; gap += 1) {
        const syntheticTime = new Date(prev.timestamp.getTime() + gap * 60000);
        normalized.push({
          timestamp: syntheticTime,
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close
        });
      }
    }
    normalized.push(current);
  }
  return normalized;
}

function getBucketEnd(timestamp, minutes) {
  const minuteIndex = Math.floor(timestamp.getTime() / 60000);
  const remainder = minuteIndex % minutes;
  const bucketEndMinute = remainder === 0 ? minuteIndex : minuteIndex + (minutes - remainder);
  return new Date(bucketEndMinute * 60000);
}

function aggregateTimeframe(candles, minutes) {
  if (candles.length === 0) {
    return [];
  }
  const aggregated = [];
  let bucketEnd = null;
  let bucket = [];

  for (const candle of candles) {
    if (!bucketEnd) {
      bucketEnd = getBucketEnd(candle.timestamp, minutes);
    }
    if (candle.timestamp.getTime() > bucketEnd.getTime()) {
      bucket = [];
      bucketEnd = getBucketEnd(candle.timestamp, minutes);
    }
    bucket.push(candle);
    if (candle.timestamp.getTime() === bucketEnd.getTime()) {
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const high = Math.max(...bucket.map((entry) => entry.high));
      const low = Math.min(...bucket.map((entry) => entry.low));
      aggregated.push({
        timestamp: bucketEnd,
        open: first.open,
        high,
        low,
        close: last.close
      });
      bucket = [];
      bucketEnd = null;
    }
  }

  return aggregated;
}

function enrichCandles(candles) {
  return candles.map((candle, index) => {
    const prev = index > 0 ? candles[index - 1] : null;
    const direction = candle.close > candle.open ? 'bullish' : 'bearish';
    const tookHigh = prev ? candle.high > prev.high : null;
    const tookLow = prev ? candle.low < prev.low : null;
    const tookBothSides = prev ? tookHigh && tookLow : null;
    const tookNeitherSide = prev ? !tookHigh && !tookLow : null;
    const closedAbovePrevHigh = prev ? candle.close > prev.high : null;
    const closedBelowPrevLow = prev ? candle.close < prev.low : null;
    const tookHighClosedBelow = prev ? tookHigh && candle.close <= prev.high : null;
    const tookLowClosedAbove = prev ? tookLow && candle.close >= prev.low : null;

    return {
      ...candle,
      direction,
      closed_above_prev_high: closedAbovePrevHigh,
      closed_below_prev_low: closedBelowPrevLow,
      took_high_closed_below: tookHighClosedBelow,
      took_low_closed_above: tookLowClosedAbove,
      took_both_sides: tookBothSides,
      took_neither_side: tookNeitherSide
    };
  });
}

function buildTimeframes(normalized) {
  const timeframes = {
    '1m': enrichCandles(normalized),
    '5m': enrichCandles(aggregateTimeframe(normalized, 5)),
    '15m': enrichCandles(aggregateTimeframe(normalized, 15)),
    '30m': enrichCandles(aggregateTimeframe(normalized, 30)),
    '1H': enrichCandles(aggregateTimeframe(normalized, 60)),
    '2H': enrichCandles(aggregateTimeframe(normalized, 120)),
    '4H': enrichCandles(aggregateTimeframe(normalized, 240)),
    'Daily': enrichCandles(aggregateTimeframe(normalized, 1440))
  };
  return timeframes;
}

const rawCsv = fs.readFileSync(DATA_PATH, 'utf8');
const parsedCandles = parseCsv(rawCsv);
const normalizedCandles = normalizeCandles(parsedCandles);
const timeframeData = buildTimeframes(normalizedCandles);

const status = {
  file: DATA_PATH,
  totalCandles: normalizedCandles.length,
  start: normalizedCandles[0]?.timestamp?.toISOString() ?? null,
  end: normalizedCandles[normalizedCandles.length - 1]?.timestamp?.toISOString() ?? null
};

function matchSequence(candle, criteria) {
  if (criteria.direction && candle.direction !== criteria.direction) {
    return false;
  }
  if (criteria.close_position) {
    if (criteria.close_position === 'above_prev_high' && !candle.closed_above_prev_high) {
      return false;
    }
    if (criteria.close_position === 'below_prev_low' && !candle.closed_below_prev_low) {
      return false;
    }
  }
  if (criteria.sweep_close) {
    if (criteria.sweep_close === 'took_high_closed_below' && !candle.took_high_closed_below) {
      return false;
    }
    if (criteria.sweep_close === 'took_low_closed_above' && !candle.took_low_closed_above) {
      return false;
    }
  }
  if (typeof criteria.took_both_sides === 'boolean' && candle.took_both_sides !== criteria.took_both_sides) {
    return false;
  }
  if (typeof criteria.took_neither_side === 'boolean' && candle.took_neither_side !== criteria.took_neither_side) {
    return false;
  }
  return true;
}

function analyzeSequence(candles, sequence) {
  let sampleSize = 0;
  const directionCounts = { bullish: 0, bearish: 0 };
  const probabilityCounts = {
    close_above_c2_high: 0,
    close_below_c2_low: 0,
    take_c2_high: 0,
    take_c2_low: 0,
    take_c1_high: 0,
    take_c1_low: 0,
    close_inside_c2: 0
  };

  for (let i = 0; i <= candles.length - sequence.length - 1; i += 1) {
    let matches = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (!matchSequence(candles[i + j], sequence[j])) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    const next = candles[i + sequence.length];
    const c2 = candles[i + sequence.length - 1];
    const c1 = sequence.length >= 2 ? candles[i + sequence.length - 2] : c2;
    sampleSize += 1;
    directionCounts[next.direction] += 1;

    if (next.close > c2.high) {
      probabilityCounts.close_above_c2_high += 1;
    }
    if (next.close < c2.low) {
      probabilityCounts.close_below_c2_low += 1;
    }
    if (next.high > c2.high) {
      probabilityCounts.take_c2_high += 1;
    }
    if (next.low < c2.low) {
      probabilityCounts.take_c2_low += 1;
    }
    if (next.high > c1.high) {
      probabilityCounts.take_c1_high += 1;
    }
    if (next.low < c1.low) {
      probabilityCounts.take_c1_low += 1;
    }
    if (next.close >= c2.low && next.close <= c2.high) {
      probabilityCounts.close_inside_c2 += 1;
    }
  }

  const toPercent = (count) => (sampleSize === 0 ? 0 : Number((count / sampleSize * 100).toFixed(2)));

  return {
    sample_size: sampleSize,
    direction_probabilities: {
      bullish: toPercent(directionCounts.bullish),
      bearish: toPercent(directionCounts.bearish)
    },
    next_candle_probabilities: Object.fromEntries(
      Object.entries(probabilityCounts).map(([key, value]) => [key, toPercent(value)])
    )
  };
}

app.get('/api/status', (req, res) => {
  res.json(status);
});

app.post('/api/analyze', (req, res) => {
  const { timeframe, sequence } = req.body ?? {};
  if (!timeframeData[timeframe]) {
    res.status(400).json({ error: 'Invalid timeframe.' });
    return;
  }
  if (!Array.isArray(sequence) || sequence.length < 2 || sequence.length > 5) {
    res.status(400).json({ error: 'Sequence must have between 2 and 5 candles.' });
    return;
  }
  const result = analyzeSequence(timeframeData[timeframe], sequence);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
