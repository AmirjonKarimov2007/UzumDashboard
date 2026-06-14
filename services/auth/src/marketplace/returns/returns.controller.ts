import {
  Controller, Get, Post, Param, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';

@Controller('marketplace/stores/:storeId/returns')
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  /** Returns Analytics — KPI'lar + filtrlangan ro'yxat + lost report */
  @Get('analytics')
  getAnalytics(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('product') product?: string,
    @Query('sku') sku?: string,
    @Query('status') status?: string,
    @Query('force') force?: string,
  ) {
    return this.returnsService.getAnalytics(userId, storeId, {
      dateFrom: dateFrom ? parseInt(dateFrom, 10) : undefined,
      dateTo: dateTo ? parseInt(dateTo, 10) : undefined,
      product: product || undefined,
      sku: sku || undefined,
      status: status || undefined,
      force: force === '1' || force === 'true',
    });
  }

  /** Qaytarilganlar nakladnoylari ro'yxati (Uzum API jonli) */
  @Get('invoices')
  listInvoices(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.returnsService.listInvoices(
      userId,
      storeId,
      page ? parseInt(page, 10) : 0,
      size ? parseInt(size, 10) : 20,
    );
  }

  /** Bitta nakladnoyning qaytarilgan mahsulotlari (returnItems[]) */
  @Get('invoices/:returnId')
  getInvoice(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('returnId') returnId: string,
  ) {
    return this.returnsService.getInvoice(userId, storeId, returnId);
  }

  /** Uzum'dan qaytarishlarni qayta sync qilish (DB'ga doimiy saqlanadi) */
  @Post('sync')
  sync(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.returnsService.syncReturns(userId, storeId).then(() => ({ ok: true }));
  }

}
