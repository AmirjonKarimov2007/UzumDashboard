-- Extend the existing automation workflow through listing generation.
ALTER TYPE "AiAutomationStatus" ADD VALUE 'READY_FOR_CREATIVE';

CREATE TABLE "ai_product_research" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "categoryReason" TEXT,
    "subcategoryId" TEXT,
    "subcategoryName" TEXT,
    "subcategoryConfidence" DOUBLE PRECISION,
    "subcategoryReason" TEXT,
    "queryTerms" JSONB NOT NULL,
    "commonCharacteristics" JSONB NOT NULL,
    "commonTitlePatterns" JSONB NOT NULL,
    "positioningIdeas" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "knownCommissionRate" DECIMAL(5,2),
    "sellerCatalogMatches" INTEGER NOT NULL DEFAULT 0,
    "publicMarketplaceMatches" INTEGER NOT NULL DEFAULT 0,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "model" TEXT,
    "responseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_product_research_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_competitor_products" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(14,2),
    "oldPrice" DECIMAL(14,2),
    "productId" TEXT,
    "url" TEXT,
    "category" TEXT,
    "characteristics" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEvidence" TEXT,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_competitor_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_pricing_analysis" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseCost" DECIMAL(14,2),
    "userPrice" DECIMAL(14,2),
    "competitorMin" DECIMAL(14,2),
    "competitorMedian" DECIMAL(14,2),
    "competitorMax" DECIMAL(14,2),
    "commissionRate" DECIMAL(5,2),
    "estimatedFees" DECIMAL(14,2),
    "estimatedLogistics" DECIMAL(14,2),
    "estimatedProfitBeforeLogistics" DECIMAL(14,2),
    "estimatedProfit" DECIMAL(14,2),
    "estimatedMargin" DECIMAL(7,2),
    "recommendedPrice" DECIMAL(14,2),
    "pricingReason" TEXT NOT NULL,
    "unavailableFields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_pricing_analysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_listing_drafts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "descriptionUz" TEXT NOT NULL,
    "featuresUz" JSONB NOT NULL,
    "titleRu" TEXT NOT NULL,
    "descriptionRu" TEXT NOT NULL,
    "featuresRu" JSONB NOT NULL,
    "seoKeywords" JSONB NOT NULL,
    "characteristics" JSONB NOT NULL,
    "infographicCopy" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "fieldSources" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "responseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_listing_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_product_research_jobId_key" ON "ai_product_research"("jobId");
CREATE INDEX "ai_product_research_storeId_idx" ON "ai_product_research"("storeId");
CREATE INDEX "ai_product_research_sourceTimestamp_idx" ON "ai_product_research"("sourceTimestamp");
CREATE INDEX "ai_competitor_products_researchId_idx" ON "ai_competitor_products"("researchId");
CREATE INDEX "ai_competitor_products_productId_idx" ON "ai_competitor_products"("productId");
CREATE INDEX "ai_competitor_products_source_idx" ON "ai_competitor_products"("source");
CREATE UNIQUE INDEX "ai_pricing_analysis_jobId_key" ON "ai_pricing_analysis"("jobId");
CREATE INDEX "ai_pricing_analysis_storeId_idx" ON "ai_pricing_analysis"("storeId");
CREATE UNIQUE INDEX "ai_listing_drafts_jobId_key" ON "ai_listing_drafts"("jobId");
CREATE INDEX "ai_listing_drafts_storeId_idx" ON "ai_listing_drafts"("storeId");

ALTER TABLE "ai_product_research" ADD CONSTRAINT "ai_product_research_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_product_research" ADD CONSTRAINT "ai_product_research_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_competitor_products" ADD CONSTRAINT "ai_competitor_products_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "ai_product_research"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_pricing_analysis" ADD CONSTRAINT "ai_pricing_analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_pricing_analysis" ADD CONSTRAINT "ai_pricing_analysis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_listing_drafts" ADD CONSTRAINT "ai_listing_drafts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_listing_drafts" ADD CONSTRAINT "ai_listing_drafts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
