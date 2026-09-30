-- Link every Smartup import to its Uzum supply invoice so the supply list can
-- show and filter the remote state without making one Uzum API call per row.
ALTER TABLE "smartup_order_imports" ADD COLUMN "uzumInvoiceId" TEXT;

CREATE INDEX "smartup_order_imports_storeId_uzumInvoiceId_idx"
ON "smartup_order_imports"("storeId", "uzumInvoiceId");

-- Backfill rows created by the invoice-level importer before this column
-- existed. The old payload note starts with: Uzum ta'minlash <invoice id>;
UPDATE "smartup_order_imports"
SET "uzumInvoiceId" = substring(
  "payload" #>> '{order,0,note}'
  FROM '^Uzum ta''minlash ([^;]+);'
)
WHERE "uzumInvoiceId" IS NULL
  AND "payload" #>> '{order,0,note}' LIKE 'Uzum ta''minlash %';
