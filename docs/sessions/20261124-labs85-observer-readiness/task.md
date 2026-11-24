# iOS readiness clock mismatch (#85, blocks #127)

The local gate failed closed after a working normal Simulator app launch. In
an exact native diagnostic, Recorder showed the ready control and sampled
5.11 seconds of visible UI with passing sample gaps, but the host readiness
comparison still rejected it.

On Mac Studio, the host's Apple Python 3.9 `time.monotonic()` measured about
0.006 s in the short-lived process, while the attached XCTest reported
system uptime in the same few-million-second domain as Darwin
`clock_gettime(CLOCK_UPTIME_RAW)`. Local Python and Swift readings confirm
the only compatible clock is awake-only uptime.

This candidate keeps the existing normal launch/attach controls and fixes
only the shared clock. It does not relax readiness (30 s), sampled stability
(5 s), sample bound (1.5 s), process monitoring, or exact candidate checking.
