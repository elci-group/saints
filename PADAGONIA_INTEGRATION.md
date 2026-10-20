# PADAGONIA Integration Roadmap

See `/home/sal/padagonia/docs/enterprise-integration-directives.md`.

## Modules

- `football_entity_mapper`: map players, teams, fixtures, matches, events,
  tactics, and competitions to versioned labels and relations.
- `historical_ingest`: write source observations with hashes, timestamps,
  provider, and confidence semantics.
- `semantic_reader`: retrieve similar players, matches, and tactical patterns
  using HNSW plus exact filters.
- `reconciliation`: deduplicate feed events and reconcile corrected fixtures.
- `analysis_export`: generate deterministic reports with source lineage.

## Acceptance gates

Historical corrections remain visible, feed replays are idempotent, and every
analytical claim carries source and freshness metadata.
