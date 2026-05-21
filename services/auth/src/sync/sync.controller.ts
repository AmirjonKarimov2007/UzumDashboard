import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SyncService, SyncJobType } from './sync.service';

@Controller('marketplace/stores/:storeId/sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('full')
  triggerFullSync(@Param('storeId') storeId: string) {
    return this.syncService.triggerFullSync(storeId);
  }

  @Post('orders')
  syncOrders(
    @Param('storeId') storeId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_ORDERS, dateFrom, dateTo);
  }

  @Post('products')
  syncProducts(@Param('storeId') storeId: string) {
    return this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_PRODUCTS);
  }

  @Post('inventory')
  syncInventory(@Param('storeId') storeId: string) {
    return this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_INVENTORY);
  }

  @Post('expenses')
  syncExpenses(
    @Param('storeId') storeId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.syncService.triggerPartialSync(storeId, SyncJobType.SYNC_EXPENSES, dateFrom, dateTo);
  }

  @Get('status')
  getSyncStatus(@Param('storeId') storeId: string) {
    return this.syncService.getSyncStatus(storeId);
  }
}
