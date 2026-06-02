-- CreateTable
CREATE TABLE "product_meta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "productId" TEXT,
    "costPrice" DECIMAL(14,2),
    "articleCode" TEXT,
    "xid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_meta_storeId_idx" ON "product_meta"("storeId");

-- CreateIndex
CREATE INDEX "product_meta_articleCode_idx" ON "product_meta"("articleCode");

-- CreateIndex
CREATE INDEX "product_meta_xid_idx" ON "product_meta"("xid");

-- CreateIndex
CREATE UNIQUE INDEX "product_meta_storeId_skuId_key" ON "product_meta"("storeId", "skuId");

-- AddForeignKey
ALTER TABLE "product_meta" ADD CONSTRAINT "product_meta_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
