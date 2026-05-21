import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('marketplace/stores/:storeId/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getDashboardMetrics(storeId, timeRange);
  }

  @Get('revenue-chart')
  getRevenueChart(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getRevenueChart(storeId, timeRange);
  }

  @Get('categories')
  getCategoryBreakdown(@Param('storeId') storeId: string) {
    return this.analyticsService.getCategoryBreakdown(storeId);
  }

  @Get('finance')
  getFinanceSummary(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getFinanceSummary(storeId, timeRange);
  }

  @Get('expenses')
  getExpenseBreakdown(
    @Param('storeId') storeId: string,
    @Query('timeRange') timeRange: string = 'month',
  ) {
    return this.analyticsService.getExpenseBreakdown(storeId, timeRange);
  }

  @Get('transactions')
  getTransactions(
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analyticsService.getTransactions(storeId, page, size, dateFrom, dateTo);
  }
}
