import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FbsService } from './fbs.service';

class BatchLabelsDto {
  @IsArray()
  orderIds!: (number | string)[];

  @IsOptional()
  @IsIn(['LARGE', 'SMALL'])
  size?: 'LARGE' | 'SMALL';
}

@Controller('marketplace/stores/:storeId/fbs')
@UseGuards(JwtAuthGuard)
export class FbsController {
  constructor(private readonly fbsService: FbsService) {}

  /** Live FBS orders for given status — directly from Uzum (no DB cache) */
  @Get('orders')
  getOrders(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('status', new DefaultValuePipe('PACKING')) status: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
  ) {
    return this.fbsService.getOrders(userId, storeId, status, page, size);
  }

  /** All FBS orders across CREATED+PACKING+RETURNED statuses */
  @Get('orders/all')
  getAllOrders(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('statuses') statusesParam?: string,
  ) {
    const statuses = statusesParam ? statusesParam.split(',') : undefined;
    return this.fbsService.getAllOrders(userId, storeId, statuses);
  }

  /** Live products from Uzum — bypasses sync, fetches directly */
  @Get('products')
  getLiveProducts(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('filter') filter?: string,
    @Query('search') searchQuery?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.fbsService.getLiveProducts(userId, storeId, page, size, filter, searchQuery, sortBy, order);
  }

  /** Live finance orders (sales) from Uzum */
  @Get('finance/orders')
  getLiveFinanceOrders(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.fbsService.getLiveFinanceOrders(
      userId, storeId, page, size,
      dateFrom ? parseInt(dateFrom, 10) : undefined,
      dateTo ? parseInt(dateTo, 10) : undefined,
    );
  }

  /** Live FBS SKU stocks from Uzum */
  @Get('stocks')
  getLiveStocks(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    return this.fbsService.getLiveStocks(userId, storeId);
  }

  /** Single PDF label — streams the PDF directly to client */
  @Get('orders/:orderId/label')
  async getLabel(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Query('size', new DefaultValuePipe('LARGE')) size: 'LARGE' | 'SMALL',
    @Res() res: Response,
  ) {
    const buffer = await this.fbsService.getLabelPdf(userId, storeId, orderId, size);
    if (!buffer) {
      throw new NotFoundException(`Label PDF for order ${orderId} mavjud emas`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="label_${orderId}.pdf"`);
    res.send(buffer);
  }

  /** Batch labels — returns JSON with base64 documents (for parallel downloads on client) */
  @Post('labels/batch')
  getBatchLabels(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: BatchLabelsDto,
  ) {
    return this.fbsService.getBatchLabelsPdf(userId, storeId, dto.orderIds, dto.size || 'LARGE');
  }
}
