# Products, supplies and Smartup

The AI dashboard routes, active NestJS module and OpenAI SDK have been removed.
Historical Prisma models/migrations and existing generated/uploaded files remain
untouched to avoid deleting seller data. No database migration is required for
this change. AI code recovery archive (local workstation only):
`C:\Users\alfatech.uz\.codex\backups\uzum-ai-removal-20260906`.

## Configuration

Set the `SMARTUP_*` values from `services/auth/.env.example` in the backend
environment. Credentials must never be placed in frontend environment variables
or committed to Git. Restart the backend after configuration changes.

Required: username, password, project code, filial ID and code, room code,
robot code, sales manager code, person code, currency code, warehouse code,
and price type code. The default base URL is `https://smartup.online`.
Keep the order status quoted when it contains `#`, for example `"B#N"`.

## Workflow

1. Open **Mahsulotlar** and enter the Smartup inventory code in each SKU's XID.
   Updating only XID no longer clears cost price or article code.
2. Click **XID va narxlarni tekshirish**. This reads the Uzum catalog, local
   mappings and fresh Smartup prices; it does not create a document. The report
   identifies missing XIDs and prices. This is a mapping/price check, not a
   guarantee of remote acceptance of an invoice.
3. Open **Ta’minlashlar** (`/supplies`). The existing invoice workflow is shared
   with `/orders`. Open the invoice and use its single **Smartupga ko'chirish**
   button. Individual order import buttons have been removed.
4. The backend resolves acceptance per order through Uzum's authoritative
   single-order endpoint. Both the live order status and its `invoiceNumber`
   must match the selected supply. Therefore a `20/18` supply sends exactly the
   18 orders accepted in that supply; the other two remain visibly marked as
   **not handed over in this supply** and can be sent later if Uzum accepts them
   under another supply. A later `CANCELED` status does not erase a historical
   handover: when the order still has this invoice number and a valid
   `acceptedDate`, it remains part of the supply's Smartup accounting. A
   cancelled order without `acceptedDate` is never included.
5. XID is deliberately **not unique**: different SKU IDs, colors and product
   listings may use the same Smartup inventory code. Quantities are combined by
   that code across the entire invoice and sent in one `order` entry. For example,
   apple 1 + apple 2 and pear 2 + pear 3 become apple 3 and pear 5.
   Already imported orders are not sent again; historical individual imports
   are not rewritten or merged retroactively.
6. A successful response stores the returned Smartup deal ID together with the
   Uzum invoice ID. The supplies list shows **Smartupda bor** plus the deal ID;
   use the **Smartupda bor** and **Ko‘chirilmagan** filters to narrow the page.
7. Every supply has an inline action. For a locally successful import it becomes
   **Tekshirish**: the send action first performs a live Smartup lookup. If the
   remote document was deleted, every row in that document becomes `NOT_FOUND`.
   If only part of a supply still exists remotely, the whole new submission is
   blocked. The remaining orders are never placed into a second Smartup
   document; the old document/association must be fully removed first.
8. Every supply that is not confirmed in Smartup has an inline **Ko‘chirish**
   action. The global status badges are calculated by walking every Uzum invoice
   page (20 rows per upstream request), not only the currently visible page.
9. `POST /marketplace/stores/:storeId/fbs/orders/:orderId/smartup/check` resolves
   the saved Smartup deal for that Uzum order and performs a live, read-only
   Smartup lookup. A present deal is confirmed as `SUCCESS`; a missing/deleted
   grouped deal marks all of its linked order rows as `NOT_FOUND`, allowing an
   intentional re-import. An order with no import record returns `NOT_IMPORTED`.

The implementation retains the project's existing Smartup endpoints:
`/b/anor/api/v2/mkf/product_price$export` and
`/b/trade/txs/tdeal/order$import`. Live order verification uses
`/b/trade/txs/tdeal/order$export` with the exact singular `deal_id` filter; the
deployed Smartup installation ignores plural/external-ID filters. Import contract compatibility must be verified
against the target Smartup installation before production use; no real orders
were created during this change.

## Safety and recovery

- Both import paths obtain authoritative order contents from Uzum on the server.
- Exact SKU/barcode mappings take precedence. An explicit unmapped SKU cannot
  fall back to a shared product title. Ambiguous title/barcode matches are rejected.
- Quantity must be finite and positive. Invalid/missing prices are not exported.
- Repeated invoice orders are deduplicated before aggregation.
- A supply import performs a live lookup for each distinct prior Smartup
  document before trusting local `SUCCESS`/`NOT_FOUND` state. All product lines
  are fully resolved and priced before the single remote import call. If any
  line is missing an XID, Smartup price or valid quantity, no document is sent.
- A partially imported supply is blocked before product lookup and before the
  Smartup import call. It cannot create a second document for the remainder.
- A short PostgreSQL advisory-lock transaction reserves all affected orders as
  `PROCESSING` before any import request. This coordinates multiple app instances.
- A remote success is saved as `SUCCESS`; invoice rows are saved atomically.
  Changing the configured outgoing order status never invalidates past success.
- A mixed Smartup response containing both `successes` and `errors` is
  quarantined as `REVIEW_REQUIRED`, including any returned deal ID and the full
  response. The normal send action never reconciles or retries such a row; an
  explicit operator check is required first.
- New document and line external IDs are deterministic, ASCII-only and at most
  20 characters. Optional notes are at most 40 characters. This stays within
  the small PL/SQL string buffers used by some Smartup installations and avoids
  `ORA-06502: character string buffer too small`. Compatible retry IDs are kept;
  oversized IDs from definitive failed imports are safely regenerated. Existing
  multi-order documents cannot be replaced by a partial retry.
- A definitive Smartup business rejection is `ERROR`. A timeout, malformed or
  contradictory response, or persistence failure after submission becomes
  `REVIEW_REQUIRED`. Requests are not automatically retried.
- After a process crash, a reservation may remain `PROCESSING`. Do not clear it
  automatically. Have the Smartup operator check the saved external ID and
  document contents. Reconcile the stored status/deal ID only after establishing
  whether the document exists. There is deliberately no blind reset/retry button.

Automatic import price reads use a 10-minute cache with shared in-flight requests;
the manual product check fetches fresh prices. Catalog lookup uses a 5-minute
store/user-scoped cache and is skipped when every order item has a direct SKU XID.
Dates are formatted explicitly in Asia/Tashkent, accepting epoch seconds or ms.

## Verification

Backend: `npm test -- --runInBand`, `npm run build` in `services/auth`.
Frontend: `npm run build` in `web`; run ESLint separately because the build skips it.
Tests use mocked Smartup responses and do not create external business documents.

2026-09-07: 29 Smartup/product-metadata tests passed, including an entire invoice
with four different SKUs mapped to two shared XIDs (apple 3, pear 5), one outbound
order and a no-op repeated import. Production frontend build and browser checks
passed: one invoice-level button/request, no per-order import request, successful
invoice disabled, and responsive invoice layout.

Local checks on 2026-09-06: PostgreSQL and the advisory-lock SQL were reachable;
Smartup environment credentials/settings were absent. A real Smartup import
remains unverified until those settings are supplied.
