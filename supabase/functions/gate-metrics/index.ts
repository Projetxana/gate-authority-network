// Source mirror note for gate-metrics v2.
// The live function is deployed in Supabase and remains backward-compatible.
// Canonical schema and API contract:
//   ../../migrations/20261011120000_verified_effect_metering_v1.sql
//   ../../../docs/GATE-METRICS-V2.md
//
// The live endpoint supports:
//   GET  /health
//   GET  /summary
//   POST /events
//   POST /verified-effects
//
// Keep production v7 gate-network untouched when evolving this metrics service.

