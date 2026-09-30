CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" DATE NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payments_storeId_occurredAt_idx" ON "supplier_payments"("storeId", "occurredAt");
CREATE INDEX "supplier_payments_storeId_supplierName_idx" ON "supplier_payments"("storeId", "supplierName");
CREATE INDEX "supplier_payments_storeId_deletedAt_idx" ON "supplier_payments"("storeId", "deletedAt");

ALTER TABLE "supplier_payments"
ADD CONSTRAINT "supplier_payments_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
