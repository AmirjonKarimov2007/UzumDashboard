import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';

@Controller('marketplace/stores/:storeId/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getOrders(
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getOrders({ storeId, page, size, search, status, dateFrom, dateTo });
  }

  @Get('summary')
  getSummary(@Param('storeId') storeId: string) {
    return this.ordersService.getOrderSummary(storeId);
  }

  @Get('recent')
  getRecent(
    @Param('storeId') storeId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.getRecentOrders(storeId, limit);
  }

  @Get(':orderId')
  getOrder(@Param('storeId') storeId: string, @Param('orderId') orderId: string) {
    return this.ordersService.getOrder(storeId, orderId);
  }
}
