import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export interface ProductMetaInput {
  costPrice?: number | null;
  articleCode?: string | null;
  xid?: string | null;
  productId?: string | null;
}

@Injectable()
export class ProductMetaService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwner(userId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
    if (!store) throw new ForbiddenException('Store not found');
  }

  /** All meta for a store, returned as a map keyed by skuId for easy client merge. */
  async getAll(userId: string, storeId: string) {
    await this.assertOwner(userId, storeId);
    const rows = await this.prisma.productMeta.findMany({ where: { storeId } });
    const map: Record<string, { costPrice: number | null; articleCode: string | null; xid: string | null }> = {};
    for (const r of rows) {
      map[r.skuId] = {
        costPrice: r.costPrice != null ? Number(r.costPrice) : null,
        articleCode: r.articleCode ?? null,
        xid: r.xid ?? null,
      };
    }
    return { meta: map, count: rows.length };
  }

  /** Upsert the seller-entered metadata for one SKU. */
  async upsert(userId: string, storeId: string, skuId: string, input: ProductMetaInput) {
    await this.assertOwner(userId, storeId);

    const clean = (v: string | null | undefined) => {
      const s = (v ?? '').trim();
      return s.length ? s : null;
    };
    const costPrice =
      input.costPrice === null || input.costPrice === undefined || Number.isNaN(Number(input.costPrice))
        ? null
        : Number(input.costPrice);
    const articleCode = clean(input.articleCode);
    const xid = clean(input.xid);
    const productId = clean(input.productId);

    const row = await this.prisma.productMeta.upsert({
      where: { storeId_skuId: { storeId, skuId } },
      create: { storeId, skuId, productId, costPrice, articleCode, xid },
      update: { costPrice, articleCode, xid, ...(productId ? { productId } : {}) },
    });

    return {
      skuId: row.skuId,
      costPrice: row.costPrice != null ? Number(row.costPrice) : null,
      articleCode: row.articleCode ?? null,
      xid: row.xid ?? null,
    };
  }
}
