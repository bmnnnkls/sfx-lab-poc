# Compact clock/full-status production campaign

Frozen production source and original harness: `../clock-source/`; verified in `../clock-identity-check.json`.
Apple M3 Pro, Chromium 156.0.8078.4, 48 kHz, 128-frame quanta (2.667 ms budget, engine p99 <1.333 ms).
All four captures completed serially, without tests/builds/RSS polling. Every first callback and every observed
outlier is retained. This campaign **fails** the unchanged whole-callback gate in the constant case.

| Scenario | Audio seconds | Engine p50/p95/p99/max ms | Callback p50/p95/p99/max ms | Engine/callback misses |
|---|---:|---|---|---:|
| constant | 64.731 | 0.463/0.863/1.161/2.459 | 0.475/0.888/1.192/3.265 | 0/1 |
| continuous | 64.741 | 0.443/0.872/1.115/2.274 | 0.457/0.902/1.149/2.423 | 0/0 |
| low-arrangement | 119.739 | 0.377/0.758/1.010/2.329 | 0.389/0.785/1.051/2.643 | 0/0 |
| glass-arrangement | 309.808 | 0.408/0.873/1.099/2.568 | 0.419/0.904/1.143/2.584 | 0/0 |

Constant first engine/callback: 2.459/3.265 ms. Native thread-clock diagnostic: callback 2.475 ms executing plus
0.790 ms not executing on that thread; no overlapping GC. This does not identify an external cause or waive the wall
deadline. Other scenarios have no measured misses. Continuous velocity sweeps for the full looping capture;
interactive commands include tempo/launch/stop and graph/scalar edits. The arrangement captures traverse all eight
Low Light and all six Glass Rain scenes, with graph/master traffic and final empty-scene tail requests. Raw scene
beats and edit history remain in each report.

All reports have zero nonfinite output, no trace data loss and only 128-frame quanta. Full-window peak/jump scans
are diagnostics, not proof of no musical discontinuity. The separate final production audio suite passes all 13
complete-window tests at the existing tolerance (`../clock-audio-ready.txt`); physical-device underrun telemetry is
unavailable. Timing includes bounded scanner/probe overhead and no per-quantum message traffic.

| Scenario | Suspended preparation ms | Node-to-ready ms |
|---|---:|---:|
| constant | 237.904 | 250.600 |
| continuous | 237.332 | 248.900 |
| low-arrangement | 242.490 | 254.000 |
| glass-arrangement | 162.768 | 172.100 |

Actual rendered frames, note clock, transport clock and audio time remain zero through preparation in every report.
Preparation latency is reported separately while suspended; no actual playback callback is excluded. Finite scans
and exact build/harness hashes are retained per report. The later hook-placement A/B is diagnostic only and does not
replace this campaign or erase its failed first callback.
