ALTER TABLE "ai_automation_jobs"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "imageLanguage" "AiImageLanguage",
  ALTER COLUMN "status" SET DEFAULT 'PRODUCT_DRAFT';

ALTER TABLE "ai_competitor_products"
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "weeklySalesCount" INTEGER,
  ADD COLUMN "weeklySalesSource" TEXT;

ALTER TABLE "ai_listing_drafts"
  ADD COLUMN "shortDescriptionRu" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "shortDescriptionUz" TEXT NOT NULL DEFAULT '';

UPDATE "ai_listing_drafts"
SET "shortDescriptionUz" = LEFT("descriptionUz", 500),
    "shortDescriptionRu" = LEFT("descriptionRu", 500);

ALTER TABLE "ai_usage_logs" ADD COLUMN "estimatedCostUsd" DECIMAL(12,6);

UPDATE "ai_usage_logs"
SET "estimatedCostUsd" = ROUND((
  "inputTokens" * CASE "model"
    WHEN 'gpt-5.6-luna' THEN 0.20 WHEN 'gpt-5.6-terra' THEN 2.00
    WHEN 'gpt-5.6-sol' THEN 4.00 WHEN 'gpt-5.6' THEN 4.00 ELSE 0 END +
  "outputTokens" * CASE "model"
    WHEN 'gpt-5.6-luna' THEN 1.20 WHEN 'gpt-5.6-terra' THEN 12.00
    WHEN 'gpt-5.6-sol' THEN 20.00 WHEN 'gpt-5.6' THEN 20.00 ELSE 0 END
) / 1000000.0, 6)
WHERE "model" IN ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6');

CREATE TABLE "ai_competitor_image_analyses" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "findings" JSONB NOT NULL,
  "imagesAnalyzed" INTEGER NOT NULL DEFAULT 0, "competitorsConsidered" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT NOT NULL, "responseId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ai_competitor_image_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_creative_briefs" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "number" INTEGER NOT NULL, "goal" TEXT NOT NULL,
  "headlineUz" TEXT NOT NULL, "headlineRu" TEXT NOT NULL, "supportingTextUz" TEXT NOT NULL,
  "supportingTextRu" TEXT NOT NULL, "composition" TEXT NOT NULL, "productAdvantage" TEXT NOT NULL,
  "competitorImprovement" TEXT NOT NULL, "promptTemplate" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_creative_briefs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_generated_images" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "briefNumber" INTEGER NOT NULL,
  "language" "AiImageLanguage" NOT NULL, "originalName" TEXT NOT NULL, "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'image/png', "size" INTEGER NOT NULL, "model" TEXT NOT NULL,
  "responseId" TEXT, "estimatedCostUsd" DECIMAL(12,6), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_generated_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_competitor_image_analyses_jobId_key" ON "ai_competitor_image_analyses"("jobId");
CREATE INDEX "ai_creative_briefs_jobId_idx" ON "ai_creative_briefs"("jobId");
CREATE UNIQUE INDEX "ai_creative_briefs_jobId_number_key" ON "ai_creative_briefs"("jobId", "number");
CREATE INDEX "ai_generated_images_jobId_idx" ON "ai_generated_images"("jobId");
CREATE UNIQUE INDEX "ai_generated_images_jobId_briefNumber_key" ON "ai_generated_images"("jobId", "briefNumber");

ALTER TABLE "ai_competitor_image_analyses" ADD CONSTRAINT "ai_competitor_image_analyses_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_creative_briefs" ADD CONSTRAINT "ai_creative_briefs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_generated_images" ADD CONSTRAINT "ai_generated_images_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ai_automation_jobs"
SET "status" = 'LISTING_READY', "progress" = 50, "currentStep" = 'image_ideas_approval'
WHERE "status" = 'READY_FOR_CREATIVE';

UPDATE "ai_job_steps" SET "key" = 'product_input', "label" = 'Mahsulot ma''lumotlari', "sortOrder" = 1 WHERE "key" = 'product_analysis';
UPDATE "ai_job_steps" SET "key" = 'image_ideas', "label" = '10 ta rasm g‘oyasi', "sortOrder" = 5 WHERE "key" = 'creative_briefs';
DELETE FROM "ai_job_steps" WHERE "key" IN ('pricing', 'quality_control', 'publishing', 'moderation', 'result');
UPDATE "ai_job_steps" SET "sortOrder" = 2 WHERE "key" = 'uzum_research';
UPDATE "ai_job_steps" SET "sortOrder" = 3 WHERE "key" = 'listing';
UPDATE "ai_job_steps" SET "sortOrder" = 7, "label" = '10 ta infografika' WHERE "key" = 'image_generation';

INSERT INTO "ai_job_steps" ("id", "jobId", "key", "label", "sortOrder", "status", "progress", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || j."id" || 'competitor_images'), j."id", 'competitor_images', 'Raqobatchi rasmlari tahlili', 4, 'WAITING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ai_automation_jobs" j
WHERE NOT EXISTS (SELECT 1 FROM "ai_job_steps" s WHERE s."jobId" = j."id" AND s."key" = 'competitor_images');

INSERT INTO "ai_job_steps" ("id", "jobId", "key", "label", "sortOrder", "status", "progress", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || j."id" || 'image_language'), j."id", 'image_language', 'Rasm tili va tasdiq', 6, 'WAITING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ai_automation_jobs" j
WHERE NOT EXISTS (SELECT 1 FROM "ai_job_steps" s WHERE s."jobId" = j."id" AND s."key" = 'image_language');
