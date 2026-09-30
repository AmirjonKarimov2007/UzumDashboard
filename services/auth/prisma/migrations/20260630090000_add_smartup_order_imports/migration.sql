-- CreateTable
CREATE TABLE "smartup_order_imports" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "uzumOrderId" TEXT NOT NULL,
    "smartupExternalId" TEXT NOT NULL,
    "smartupDealId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smartup_order_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smartup_order_imports_storeId_uzumOrderId_key" ON "smartup_order_imports"("storeId", "uzumOrderId");

-- CreateIndex
CREATE INDEX "smartup_order_imports_storeId_idx" ON "smartup_order_imports"("storeId");

-- CreateIndex
CREATE INDEX "smartup_order_imports_smartupDealId_idx" ON "smartup_order_imports"("smartupDealId");

-- AddForeignKey
ALTER TABLE "smartup_order_imports" ADD CONSTRAINT "smartup_order_imports_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
