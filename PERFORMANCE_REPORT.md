# Search Performance Report

Measured on 10 October 2026. These numbers describe this deployment and dataset at the time of measurement; they are not general performance guarantees.

## Redis search response cache

Target: `https://fdfed-1-4u4f.onrender.com/api/search?q=iphone` (one matching product).

Method: Warm the deployed API, then run 30 pairs of requests per run. Each pair uses a fresh but equivalent MongoDB text query, so the first response must have `X-Cache: MISS` and the second must have `X-Cache: HIT`. The benchmark includes response body transfer and checks that the result count matches the baseline. The final run also checks exact result identities. Run with `cd api && node scripts/resume-cache-benchmark.js`.

| Run | Pairs | Median miss | Median hit | Median reduction | Mean miss | Mean hit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 30 | 493.27 ms | 255.60 ms | 48.18% | 501.47 ms | 257.12 ms |
| 2 | 30 | 483.75 ms | 243.07 ms | 49.75% | 511.63 ms | 258.52 ms |
| 3 | 30 | 504.96 ms | 257.14 ms | 49.08% | 518.20 ms | 254.82 ms |

**Defensible summary:** Cache hits had about **49% lower median end-to-end response time** than paired misses in these runs. This is a measured benchmark result for repeated search requests, not a production traffic average.

The original `npm run benchmark:cache` sends the same query ten times. Its 90% hit ratio is a consequence of one miss followed by nine hits, not an observed user-traffic hit ratio. In the 10 October run, its only miss took 43.38 seconds, consistent with server cold-start effects; it must not be used as a representative uncached latency.

## MongoDB text search indexes

The `npm run benchmark:db` query-plan report showed `IXSCAN` and `TEXT_MATCH` stages for all six catalog collections. This verifies index usage, not a speedup percentage.

The repository's `npm run benchmark:db:compare` compares regex queries with indexed text queries. On the current small remote database, five iterations per collection yielded **15.55% slower** overall indexed-query time (42.51 ms versus 49.12 ms). Thirty iterations per collection yielded **0.22% slower** indexed-query time (41.57 ms versus 41.66 ms). The collections examined only 1–10 documents in the query plans, and network latency dominates these short operations. The regex and text queries also have different matching semantics. Therefore, the old **25.97% overall improvement** claim is not supported by this test.

## Resume guidance

Use the approximately 49% repeated-search cache result only with the benchmark context above. Do not claim a 90% real-world cache hit ratio or a 25.97% MongoDB search speedup from the available evidence.
