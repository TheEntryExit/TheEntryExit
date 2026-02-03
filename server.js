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
  const indexMap = {
    ts_event: header.indexOf('ts_event'),
    open: header.indexOf('open'),
    high: header.indexOf('high'),
    low: header.indexOf('low'),
    close: header.indexOf('close')
  };
  const missingColumns = Object.entries(indexMap)
    .filter(([, value]) => value === -1)
    .map(([key]) => key);
  if (missingColumns.length > 0) {
    throw new Error(`CSV missing required columns: ${missingColumns.join(', ')}`);
  }
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    const timestamp = parseTimestamp(parts[indexMap.ts_event]);
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

function computeBodyBucket(candle) {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return '0-20';
  }
  const bodyPercent = Math.abs(candle.close - candle.open) / range * 100;
  if (bodyPercent < 20) return '0-20';
  if (bodyPercent < 40) return '20-40';
  if (bodyPercent < 60) return '40-60';
  if (bodyPercent < 80) return '60-80';
  return '80-100';
}

function computeCloseBehavior(prev, current) {
  if (!prev) {
    return null;
  }
  const tookHigh = current.high > prev.high;
  const tookLow = current.low < prev.low;
  if (tookHigh && tookLow) {
    return 'took_both_sides';
  }
  if (current.close > prev.high) {
    return 'closed_above_prev_high';
  }
  if (tookHigh && current.close <= prev.high) {
    return 'took_high_closed_below';
  }
  if (current.close < prev.low) {
    return 'closed_below_prev_low';
  }
  if (tookLow && current.close >= prev.low) {
    return 'took_low_closed_above';
  }
  return 'inside_prev_range';
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
    const direction = candle.close > candle.open ? 'bullish' : candle.close < candle.open ? 'bearish' : 'bearish';
    return {
      ...candle,
      direction,
      body_bucket: computeBodyBucket(candle),
      close_behavior: computeCloseBehavior(prev, candle)
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
  if (criteria.body_bucket && candle.body_bucket !== criteria.body_bucket) {
    return false;
  }
  if (criteria.close_behavior && candle.close_behavior !== criteria.close_behavior) {
    return false;
  }
  return true;
}

function analyzeSequence(candles, sequence) {
  let sampleSize = 0;
  const directionCounts = { bullish: 0, bearish: 0 };
  const priceActionCounts = {
    closed_above_c2_high: 0,
    closed_above_c1_high: 0,
    closed_below_c2_low: 0,
    closed_below_c1_low: 0,
    took_high_closed_below: 0,
    took_low_closed_above: 0,
    took_both_sides: 0
  };
  const bodyBucketCounts = {
    '0-20': 0,
    '20-40': 0,
    '40-60': 0,
    '60-80': 0,
    '80-100': 0
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
    bodyBucketCounts[next.body_bucket] += 1;

    if (next.close > c2.high) {
      priceActionCounts.closed_above_c2_high += 1;
    }
    if (next.close > c1.high) {
      priceActionCounts.closed_above_c1_high += 1;
    }
    if (next.close < c2.low) {
      priceActionCounts.closed_below_c2_low += 1;
    }
    if (next.close < c1.low) {
      priceActionCounts.closed_below_c1_low += 1;
    }
    if (next.high > c2.high && next.close <= c2.high) {
      priceActionCounts.took_high_closed_below += 1;
    }
    if (next.low < c2.low && next.close >= c2.low) {
      priceActionCounts.took_low_closed_above += 1;
    }
    if (next.high > c2.high && next.low < c2.low) {
      priceActionCounts.took_both_sides += 1;
    }
  }

  const toPercent = (count) => (sampleSize === 0 ? 0 : Number((count / sampleSize * 100).toFixed(2)));

  return {
    sample_size: sampleSize,
    direction_probabilities: {
      bullish: toPercent(directionCounts.bullish),
      bearish: toPercent(directionCounts.bearish)
    },
    price_action_probabilities: Object.fromEntries(
      Object.entries(priceActionCounts).map(([key, value]) => [key, toPercent(value)])
    ),
    body_bucket_distribution: Object.fromEntries(
      Object.entries(bodyBucketCounts).map(([key, value]) => [key, toPercent(value)])
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
  if (!Array.isArray(sequence) || sequence.length === 0) {
    res.status(400).json({ error: 'Sequence is required.' });
    return;
  }
  const result = analyzeSequence(timeframeData[timeframe], sequence);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
