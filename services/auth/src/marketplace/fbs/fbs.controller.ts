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
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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

class StockUpdateItem {
  @IsNumber()
  skuId!: number;

  @IsNumber()
  amount!: number;
}

class SetStocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockUpdateItem)
  updates!: StockUpdateItem[];
}

class CancelOrderDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

class IdentifierItem {
  @IsNumber()
  orderItemId!: number;

  @IsArray()
  values!: string[];
}

class SetIdentifiersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IdentifierItem)
  items!: IdentifierItem[];
}

class PriceSkuItem {
  @IsNumber()
  skuId!: number;

  @IsOptional()
  @IsNumber()
  fullPrice?: number;

  @IsOptional()
  @IsNumber()
  sellPrice?: number;

  @IsOptional()
  @IsString()
  skuTitle?: string;
}

class UpdatePricesDto {
  @IsNumber()
  productId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceSkuItem)
  skuList!: PriceSkuItem[];
}

class CreateInvoiceDto {
  @IsArray()
  orderIds!: number[];

  @IsString()
  dropOffPointUuid!: string;

  @IsString()
  timeSlotUuid!: string;

  @IsNumber()
  sellerId!: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
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
    @Query('scheme') scheme?: 'FBS' | 'DBS',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.fbsService.getOrders(userId, storeId, status, page, size, {
      scheme,
      dateFrom: dateFrom ? parseInt(dateFrom, 10) : undefined,
      dateTo: dateTo ? parseInt(dateTo, 10) : undefined,
    });
  }

  /** Counts per status — for the Orders page tabs */
  @Get('orders/counts')
  getOrderCounts(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.fbsService.getOrderCounts(
      userId, storeId,
      dateFrom ? parseInt(dateFrom, 10) : undefined,
      dateTo ? parseInt(dateTo, 10) : undefined,
    );
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

  /** Confirm a CREATED order — moves it to PACKING */
  @Post('orders/:orderId/confirm')
  confirmOrder(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.fbsService.confirmOrder(userId, storeId, orderId);
  }

  /** Cancel an order with a reason */
  @Post('orders/:orderId/cancel')
  cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.fbsService.cancelOrder(userId, storeId, orderId, dto.reason, dto.comment);
  }

  /** Bind identifiers (IMEI / ASL belgisi) to order items */
  @Post('orders/:orderId/identifiers')
  setIdentifiers(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body() dto: SetIdentifiersDto,
  ) {
    return this.fbsService.setOrderIdentifiers(userId, storeId, orderId, dto.items);
  }

  /** Valid cancel/return reasons (cached) */
  @Get('return-reasons')
  getReturnReasons(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.fbsService.getReturnReasons(userId, storeId);
  }

  // ─── DBS order actions ────────────────────────────────────────────────

  @Post('dbs/orders/:orderId/delivering')
  dbsDelivering(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.fbsService.dbsDelivering(userId, storeId, orderId);
  }

  @Post('dbs/orders/:orderId/completed')
  dbsCompleted(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Query('issueCode') issueCode?: string,
  ) {
    return this.fbsService.dbsCompleted(userId, storeId, orderId, issueCode ? parseInt(issueCode, 10) : undefined);
  }

  @Post('dbs/orders/:orderId/refund')
  dbsRefund(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.fbsService.dbsRefund(userId, storeId, orderId);
  }

  // ─── Product price ────────────────────────────────────────────────────

  /** Change SKU prices for a product */
  @Post('products/prices')
  updatePrices(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: UpdatePricesDto,
  ) {
    return this.fbsService.updatePrices(userId, storeId, dto.productId, dto.skuList);
  }

  // ─── Returns (Qaytarishlar) ───────────────────────────────────────────

  @Get('returns')
  getReturns(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('returnId') returnId?: string,
  ) {
    return this.fbsService.getReturns(userId, storeId, { page, size, returnId });
  }

  /** FBO supply invoices with SKU composition */
  @Get('supply-invoices')
  getSupplyInvoices(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
  ) {
    return this.fbsService.getSupplyInvoices(userId, storeId, page, size);
  }

  // ─── Invoices (Ta'minlashlar) ────────────────────────────────────────

  @Get('invoices')
  getInvoices(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('statuses') statusesParam?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size?: number,
  ) {
    const statuses = statusesParam ? statusesParam.split(',') : undefined;
    return this.fbsService.getInvoices(userId, storeId, statuses, page, size);
  }

  @Get('invoices/:invoiceId')
  getInvoice(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.fbsService.getInvoice(userId, storeId, invoiceId);
  }

  @Get('invoices/:invoiceId/orders')
  getInvoiceOrders(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.fbsService.getInvoiceOrders(userId, storeId, invoiceId);
  }

  /** Supply act PDF (yuborish dalolatnomasi) — streams the official Uzum PDF */
  @Get('invoices/:invoiceId/act')
  async getInvoiceAct(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('invoiceId') invoiceId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.fbsService.getInvoiceActPdf(userId, storeId, invoiceId);
    if (!buffer) throw new NotFoundException(`Ta'minlash #${invoiceId} akti mavjud emas`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="act_${invoiceId}.pdf"`);
    res.send(buffer);
  }

  /** Acceptance (closing) act PDF (qabul akti) — only after acceptance */
  @Get('invoices/:invoiceId/closing-documents')
  async getInvoiceClosing(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('invoiceId') invoiceId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.fbsService.getInvoiceClosingPdf(userId, storeId, invoiceId);
    if (!buffer) throw new NotFoundException(`Ta'minlash #${invoiceId} qabul akti mavjud emas`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="closing_${invoiceId}.pdf"`);
    res.send(buffer);
  }

  /** Cancel a supply invoice */
  @Post('invoices/:invoiceId/cancel')
  cancelInvoice(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.fbsService.cancelInvoice(userId, storeId, invoiceId);
  }

  /** Create a supply invoice from confirmed orders */
  @Post('invoices')
  createInvoice(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.fbsService.createInvoice(userId, storeId, dto);
  }

  /** Drop-off points suitable for a set of orders */
  @Get('invoices/dop/drop-off-points')
  getDropOffPoints(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('orderIds') orderIds: string,
  ) {
    const ids = (orderIds || '').split(',').filter(Boolean);
    return this.fbsService.getInvoiceDropOffPoints(userId, storeId, ids);
  }

  /** Time-slots for a drop-off point + set of orders */
  @Get('invoices/dop/time-slots')
  getTimeSlots(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('dopId') dopId: string,
    @Query('orderIds') orderIds: string,
  ) {
    const ids = (orderIds || '').split(',').filter(Boolean);
    return this.fbsService.getInvoiceTimeSlots(userId, storeId, dopId, ids);
  }

  /** Full product-level analytics (aggregated, cached 5 min) */
  @Get('products/analytics')
  getProductAnalytics(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('force') force?: string,
  ) {
    return this.fbsService.getProductAnalytics(userId, storeId, force === '1' || force === 'true');
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

  /** Live FBS SKU stocks from Uzum (enriched with product info) */
  @Get('stocks')
  getLiveStocks(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Query('force') force?: string,
  ) {
    return this.fbsService.getLiveStocks(userId, storeId, force === '1' || force === 'true');
  }

  /** Update FBS SKU stock amounts (partial — only listed SKUs change) */
  @Post('stocks')
  setStocks(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: SetStocksDto,
  ) {
    return this.fbsService.setStocks(userId, storeId, dto.updates);
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

  /** Flat list of barcodes for a set of orders (used for QR-code printing) */
  @Post('barcodes/batch')
  getBatchBarcodes(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: BatchLabelsDto,
  ) {
    return this.fbsService.getOrderItemBarcodes(userId, storeId, dto.orderIds);
  }
}
