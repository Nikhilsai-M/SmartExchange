import { performance } from "node:perf_hooks";

const baseUrl = (process.env.BENCHMARK_API_BASE_URL || "https://fdfed-1-4u4f.onrender.com").replace(/\/$/, "");
const query = process.env.BENCHMARK_QUERY || "iphone";
const pairs = Math.max(10, Number.parseInt(process.env.BENCHMARK_PAIRS || "30", 10));
const runId = Date.now().toString(36);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function measure(searchTerm) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(searchTerm)}`);
  const body = await response.json();
  const elapsedMs = performance.now() - started;
  if (!response.ok || body.success !== true) {
    throw new Error(`Search failed: HTTP ${response.status}`);
  }
  return {
    elapsedMs,
    cache: response.headers.get("x-cache"),
    count: body.results?.length ?? 0,
    resultIds: (body.results || []).map((item) => `${item.type}:${item.id}`).sort(),
  };
}

async function main() {
  await fetch(`${baseUrl}/api/health`);
  const baseline = await measure(query);
  if (baseline.count === 0) {
    throw new Error(`Baseline query '${query}' returned no results`);
  }

  const measurements = [];
  for (let i = 0; i < pairs; i += 1) {
    // MongoDB text search treats terms as alternatives. The nonce makes a fresh
    // cache key while retaining results for the real search term.
    const searchTerm = `${query} bench${runId}${i}`;
    const miss = await measure(searchTerm);
    const hit = await measure(searchTerm);
    if (miss.cache !== "MISS" || hit.cache !== "HIT") {
      throw new Error(`Pair ${i + 1}: expected MISS/HIT, got ${miss.cache}/${hit.cache}`);
    }
    if (JSON.stringify(miss.resultIds) !== JSON.stringify(baseline.resultIds) ||
        JSON.stringify(hit.resultIds) !== JSON.stringify(baseline.resultIds)) {
      throw new Error(`Pair ${i + 1}: result identities differ from baseline`);
    }
    measurements.push({ missMs: miss.elapsedMs, hitMs: hit.elapsedMs });
  }

  const misses = measurements.map((row) => row.missMs);
  const hits = measurements.map((row) => row.hitMs);
  const medianMissMs = median(misses);
  const medianHitMs = median(hits);
  const meanMissMs = mean(misses);
  const meanHitMs = mean(hits);
  console.log(JSON.stringify({
    endpoint: `${baseUrl}/api/search`,
    query,
    pairs,
    resultCount: baseline.count,
    method: "Warm server; unique equivalent queries; paired MISS then HIT; response body included",
    medianMissMs: Number(medianMissMs.toFixed(2)),
    medianHitMs: Number(medianHitMs.toFixed(2)),
    medianReductionPercent: Number(((medianMissMs - medianHitMs) / medianMissMs * 100).toFixed(2)),
    meanMissMs: Number(meanMissMs.toFixed(2)),
    meanHitMs: Number(meanHitMs.toFixed(2)),
    meanReductionPercent: Number(((meanMissMs - meanHitMs) / meanMissMs * 100).toFixed(2)),
    measurements: measurements.map(({ missMs, hitMs }) => ({
      missMs: Number(missMs.toFixed(2)), hitMs: Number(hitMs.toFixed(2)),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
