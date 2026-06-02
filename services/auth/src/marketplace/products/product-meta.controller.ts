import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsNumber, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductMetaService } from './product-meta.service';

class UpsertProductMetaDto {
  @IsOptional()
  @ValidateIf((o) => o.costPrice !== null)
  @IsNumber()
  costPrice?: number | null;

  @IsOptional()
  @IsString()
  articleCode?: string | null;

  @IsOptional()
  @IsString()
  xid?: string | null;

  @IsOptional()
  @IsString()
  productId?: string | null;
}

@Controller('marketplace/stores/:storeId/product-meta')
@UseGuards(JwtAuthGuard)
export class ProductMetaController {
  constructor(private readonly service: ProductMetaService) {}

  /** All seller-entered product metadata for the store (map by skuId). */
  @Get()
  getAll(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    return this.service.getAll(userId, storeId);
  }

  /** Upsert cost price / article code / XID for one SKU. */
  @Put(':skuId')
  upsert(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('skuId') skuId: string,
    @Body() dto: UpsertProductMetaDto,
  ) {
    return this.service.upsert(userId, storeId, skuId, dto);
  }
}
