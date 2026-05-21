import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';

@Controller('marketplace/stores/:storeId/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getInventory(
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getInventory(storeId, page, size, status, search);
  }

  @Get('summary')
  getSummary(@Param('storeId') storeId: string) {
    return this.inventoryService.getInventorySummary(storeId);
  }
}
