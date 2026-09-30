# Dashboard improvements — 2026-09-07

## Products and labels

The “Tan narxi kiritilmaganlar” filter runs on the server before pagination.
A product qualifies when at least one SKU has no seller-entered cost. An explicit
zero is an entered value. Saving a cost refreshes the metadata and filtered list.
Search includes all SKU variants, barcodes, article codes and XIDs across the
catalog. Search is debounced and results stay paginated.

Labels now request one 24-product page, without a separate total-count
request and reverse-page reload. The backend shares a catalog cache and sorts
IDs itself because live Uzum responses were observed to ignore ID DESC.
Search uses the same server-side metadata search.
Cross-page label selections retain SKU text and reset when switching stores.
Printing yields periodically to keep progress visible during large QR jobs.

## Orders and supplies

Only the active section loads: orders do not load invoices in the background,
and closed detail/create dialogs do not issue their own queries. Identical reads
share one upstream request. Orders/invoice pages have a five-second server cache;
order actions invalidate it. In-flight pre-action reads cannot repopulate it.

Invoices request only the current upstream page, instead of scanning up to 100
pages to calculate a total. They preserve upstream ordering and use “next page”
rather than inventing an exact global total. A full last page can have an empty
next page because Uzum does not supply an exact count on this endpoint.

PDF labels reuse successful short-lived results, share in-flight requests, and
avoid the three extra outer retry passes. Missing/failed documents are not cached.
Request failures are shown explicitly rather than as empty data. Order read
timeouts are bounded at ten seconds per attempt, with two upstream attempts.

Sync status waits at most 750 ms for queue inspection. A failed/unavailable queue
sets queueStatusAvailable=false and does not prevent connection status rendering.
The existing local Redis 3.0.504 is incompatible with BullMQ's >=5 requirement;
background sync remains limited until that environment issue is addressed.

## Super-admin

The authenticated database phone +998917897621 (also stored without the leading
plus) is the designated super-admin. The backend guard is authoritative; client
flags and headers cannot grant access. The UI is at /super-admin.

The paginated user list includes user totals, store totals, owned stores and
internal/Uzum store IDs. API keys are obtained only from the separately protected
reveal endpoint. Its response is no-store and every successful view is audited
without saving the key in the audit log. Apply the additive migration
20260907110000_admin_key_view_audit when deploying.

Unlinked Telegram users no longer inherit the sole account in a single-user
database. Store sync routes verify ownership, and cached FBS reads also recheck
access. Account profile queries are scoped to the signed-in user.

## Verification

52 backend tests passed across the full run plus focused reruns after fixing test
type annotations. Frontend/backend builds and changed-file lint passed. Headless
Chrome checks with synthetic API fixtures covered missing-cost filtering, hidden
request suppression, labels request count, key reveal/hide, non-admin access and
390px mobile layout; no page errors were reported.

Read-only measurements against the owner's live Uzum store (service calls,
2026-09-07; not a general network latency guarantee):

| Request | Cold | Warm |
| --- | ---: | ---: |
| Orders | 603 ms | 98 ms |
| Invoice page | 976 ms | 4 ms |
| Label product page | 1854 ms | 4 ms |
| Missing-cost filter (catalog already loaded) | 11 ms | 3 ms |

An earlier independent missing-cost check with a cold catalog took 1770 ms.

At measurement time the catalog had 82 products; 54 matched the missing-cost
predicate. The database contained 9 users. No orders, prices or stock quantities
were changed by the measurements.
