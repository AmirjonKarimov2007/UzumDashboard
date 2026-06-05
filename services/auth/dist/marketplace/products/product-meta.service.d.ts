import { PrismaService } from '../../common/database/prisma.service';
export interface ProductMetaInput {
    costPrice?: number | null;
    articleCode?: string | null;
    xid?: string | null;
    productId?: string | null;
}
export declare class ProductMetaService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwner;
    getAll(userId: string, storeId: string): Promise<{
        meta: Record<string, {
            costPrice: number | null;
            articleCode: string | null;
            xid: string | null;
        }>;
        count: number;
    }>;
    upsert(userId: string, storeId: string, skuId: string, input: ProductMetaInput): Promise<{
        skuId: string;
        costPrice: number | null;
        articleCode: string | null;
        xid: string | null;
    }>;
}
