CREATE TABLE "manual_withdrawals" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'bajarildi',
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "manual_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_withdrawals_storeId_occurredAt_idx"
    ON "manual_withdrawals"("storeId", "occurredAt");
CREATE INDEX "manual_withdrawals_storeId_deletedAt_idx"
    ON "manual_withdrawals"("storeId", "deletedAt");

ALTER TABLE "manual_withdrawals"
    ADD CONSTRAINT "manual_withdrawals_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
