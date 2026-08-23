# Phase 3 Step 7 — Governed Catalog Administration

**Local classification:** `PHASE3_STEP7_CATALOG_ADMIN_IMPLEMENTED`

This report documents the actual Step 7 implementation on `feature/phase3-catalog-admin`. The implementation source commit is **`130d0158c4d14361c7c9521a623437cdcada103f`**, rooted at canonical baseline **`20d1dca9e0a8adca06a5bc46f85057f151388154`**. No production database, production credential, deployment, tag, or merge was performed.

## Audited starting architecture

| Area | Source evidence | Finding retained by Step 7 |
| --- | --- | --- |
| Catalog identities | `drizzle/schema.ts:315–333`; `drizzle/0022_motionless_quicksilver.sql:17–34` | Canonical name, server-stored normalized name, optional medicine metadata, active flag, and a unique normalized-name constraint already existed. |
| Alias governance | `drizzle/schema.ts:335–354`; `drizzle/0022_motionless_quicksilver.sql:1–14` | Aliases already store optional vendor scope, text, normalized text, source, active state, creator, and a unique `(vendorId, normalizedAlias)` constraint. Empty `vendorId` is the established global-alias convention. |
| Matching read path | `server/db.ts:761–774`; `server/catalogMatching/matcher.ts:68–103` | Matching reads only active items and aliases. The deterministic matcher remains read-only, ranked, conflict-aware, and cannot create catalog, PO, receipt, inventory, or stock data. |
| Historical PO and evidence linkage | `drizzle/schema.ts:176–186`; `drizzle/schema.ts:284–308`; `server/routers.ts:169–230` | PO line items retain an optional `catalogItemId`; immutable reviewed evidence retains catalog resolutions. Step 7 does not rewrite either record type. |
| RBAC and audit primitives | `server/db.ts:839–854`; `server/db.ts:943–1074`; `server/routers.ts:233–240` | Reusable audit insertion and existing purchase-order feature access were available. Admin bypass remains authoritative; non-admin PO access remains permission-based. |

## Authority and administration model

Catalog **writes** are restricted to `adminProcedure`. The new `catalogAdmin` router permits an authenticated consultant or staff member to perform catalog reads only when their established `purchase_orders` permission is enabled, matching the Step 5 read boundary. No new role-permission key was added because no consultant/staff catalog-management write surface was introduced.

| Operation | Authority | Behavior |
| --- | --- | --- |
| Search/list/read catalog items and aliases | Admin, or consultant/staff with `purchase_orders` enabled | Retrieves curated reference data only. |
| Create/update/deactivate/reactivate catalog item | Admin only | Server computes normalized identity, enforces duplicate safety, writes an audit event. |
| Create/deactivate/reactivate alias | Admin only | Server computes normalized alias; global scope uses `vendorId = ""`; vendor scope is explicitly selected and verified. |
| Existing PO review matching | Existing PO access | Remains deterministic, read-only, and requires explicit human acceptance before a PO line is linked. |

## Normalization, duplicate protection, and aliases

Step 7 reuses `normalizeCatalogText` from `server/catalogMatching/normalize.ts:39–50`. This normalizes casing, benign punctuation, controlled abbreviations, and units while retaining strength, dosage form, release markers, concentration, and combination components as meaningful tokens. The server, not the client, derives `normalizedName` and `normalizedAlias`.

Before catalog item writes, the router checks the existing normalized-name record and the database’s `catalogItems_normalizedName_unique` constraint remains the final concurrency protection. Before alias creation, it checks the existing scoped normalized alias and the database’s `catalogItemAliases_vendor_alias_unique` constraint remains the final protection. Database duplicate errors are mapped to a stable, user-readable catalog error.

The UI presents an empty vendor scope as **Global alias** and a non-empty scope as **Vendor-specific** with the vendor name. Aliases are explicit human curation records only; there is no OCR learning, accepted-match learning, automatic alias creation, automatic product merge, LLM enrichment, or automatic generic/brand substitution.

## Deactivation, historical integrity, and inventory boundary

Catalog items and aliases use the existing `active` field for soft deactivation. Inactive records remain available to administrators through `includeInactive` reads and retain their historical identifiers. Normal matching continues to obtain only active items and aliases through the unchanged Step 5 helpers, so deactivated identities are not offered as normal future suggestions.

Catalog updates operate only on `catalogItems`; alias activation changes operate only on `catalogItemAliases`. The implementation deliberately does not call PO creation, reviewed-evidence persistence, Goods Receipt, inventory, or stock-movement helpers. Historical `purchaseOrderItems.catalogItemId` values remain valid after an item rename, while historical submitted item descriptions and `catalogResolutionsJson` remain immutable.

Every write is performed with its audit event in the same database transaction. Audit records use the authenticated server-side actor ID, the catalog/alias record ID, one of the Step 7 action types, and safe old/new reference-data snapshots. No patient data, credentials, or secrets are included in these events.

## UI behavior

`client/src/pages/CatalogManagement.tsx` adds an **Admin / Settings / Catalog Management** surface. It provides searchable catalog items, explicit create/edit controls, activate/deactivate controls, and per-item alias management. The page explains that changes affect only future suggestions. It does not embed catalog controls in the Scan PO review screen.

The new route is wrapped by the existing `AdminOnly` component in `client/src/App.tsx`, and the sidebar item in `client/src/components/DashboardLayout.tsx` is `adminOnly`. The purchase-order page and its human-review/catalog-acceptance flow are unchanged.

## Schema impact

**No schema change or migration was required.** Step 5 already supplied the required catalog fields, active flags, primary keys, unique indexes, historical PO reference column, and immutable evidence field. Therefore `drizzle/0022_motionless_quicksilver.sql`, the deterministic baseline, and baseline bootstrap assertions are unchanged. No production migration was considered or executed.

## Tests and validation

| Validation | Result |
| --- | --- |
| `pnpm check` | Passed with zero TypeScript errors. |
| `pnpm test --run server/catalogAdmin.test.ts` | Passed: **9/9** tests. |
| Required Step 1–7 targeted suites | Passed: **58/58** tests across catalog admin/matching, OCR, PDF OCR, parser, review-prefill, and evidence suites. |
| `pnpm test --run` | Passed: **227/227** tests across 27 files. |
| `pnpm build` | Passed. Vite emitted only a non-failing large-chunk advisory. |
| `git diff --check` | Passed with no whitespace errors. |

The Step 7 tests cover admin write authority, server-derived normalization, duplicate canonical protection, clinically distinct strength values, metadata update without business mutation, soft deactivate/reactivate behavior, global and vendor-specific aliases, alias duplicate protection, non-admin write denial, permission-based reads, server-derived audit actor, and direct zero-PO/receipt/inventory mutation assertions. The existing Step 5 suite remains green and continues to prove deterministic matching and explicit PO acceptance.

## Known limitations and exclusions

This scope does not add hard deletes, external drug data, automatic matching acceptance, alias learning, catalog learning, product merging, inventory merging, historical PO relinking, Goods Receipt creation, stock posting, LLM catalog enrichment, or a production schema/data change. Catalog metadata is reference data only. An admin must curate each item or alias deliberately.

## Publication status

The implementation commit has been created locally. The next required gate is a normal push of `feature/phase3-catalog-admin`, followed by a pull request to `main` and a green `CI Validation / validate` result. This task must stop after that green protected CI result without merging.
