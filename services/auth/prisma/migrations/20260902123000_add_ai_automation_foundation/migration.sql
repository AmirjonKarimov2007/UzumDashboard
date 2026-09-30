-- CreateEnum
CREATE TYPE "AiAutomationStatus" AS ENUM (
    'QUEUED',
    'ANALYZING_PRODUCT',
    'ANALYSIS_COMPLETE',
    'RESEARCHING_UZUM',
    'CALCULATING_PRICE',
    'GENERATING_LISTING',
    'PLANNING_IMAGES',
    'GENERATING_IMAGES',
    'QUALITY_CONTROL',
    'READY_TO_PUBLISH',
    'PUBLISHING',
    'MODERATION',
    'SUCCESS',
    'RETRYING',
    'NEEDS_ATTENTION',
    'REJECTED',
    'FAILED'
);

-- CreateEnum
CREATE TYPE "AiJobStepStatus" AS ENUM (
    'WAITING',
    'IN_PROGRESS',
    'COMPLETED',
    'NEEDS_ATTENTION',
    'FAILED'
);

-- CreateTable
CREATE TABLE "ai_automation_jobs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "AiAutomationStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "productName" TEXT NOT NULL,
    "knownDimensions" TEXT,
    "purchaseCost" DECIMAL(14,2),
    "desiredSellingPrice" DECIMAL(14,2),
    "sku" TEXT,
    "barcode" TEXT,
    "knownCharacteristics" TEXT,
    "additionalNotes" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_job_steps" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "AiJobStepStatus" NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_job_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_original_images" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_original_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_product_analysis" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "summary" TEXT,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "responseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_product_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "responseId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_automation_jobs_storeId_idx" ON "ai_automation_jobs"("storeId");
CREATE INDEX "ai_automation_jobs_status_idx" ON "ai_automation_jobs"("status");
CREATE INDEX "ai_automation_jobs_createdAt_idx" ON "ai_automation_jobs"("createdAt");
CREATE UNIQUE INDEX "ai_job_steps_jobId_key_key" ON "ai_job_steps"("jobId", "key");
CREATE INDEX "ai_job_steps_jobId_sortOrder_idx" ON "ai_job_steps"("jobId", "sortOrder");
CREATE INDEX "ai_original_images_jobId_idx" ON "ai_original_images"("jobId");
CREATE UNIQUE INDEX "ai_product_analysis_jobId_key" ON "ai_product_analysis"("jobId");
CREATE INDEX "ai_usage_logs_jobId_idx" ON "ai_usage_logs"("jobId");
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_automation_jobs" ADD CONSTRAINT "ai_automation_jobs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_job_steps" ADD CONSTRAINT "ai_job_steps_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_original_images" ADD CONSTRAINT "ai_original_images_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_product_analysis" ADD CONSTRAINT "ai_product_analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
