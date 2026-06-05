import { ProductMetaService } from './product-meta.service';
declare class UpsertProductMetaDto {
    costPrice?: number | null;
    articleCode?: string | null;
    xid?: string | null;
    productId?: string | null;
}
export declare class ProductMetaController {
    private readonly service;
    constructor(service: ProductMetaService);
    getAll(userId: string, storeId: string): Promise<{
        meta: Record<string, {
            costPrice: number | null;
            articleCode: string | null;
            xid: string | null;
        }>;
        count: number;
    }>;
    upsert(userId: string, storeId: string, skuId: string, dto: UpsertProductMetaDto): Promise<{
        skuId: string;
        costPrice: number | null;
        articleCode: string | null;
        xid: string | null;
    }>;
}
export {};
