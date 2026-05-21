import { Controller, Get, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';

@Controller('marketplace/stores/:storeId/products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  getProducts(
    @Param('storeId') storeId: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.productsService.getProducts({ storeId, page, size, search, status, category, sortBy, order });
  }

  @Get('summary')
  getSummary(@Param('storeId') storeId: string) {
    return this.productsService.getProductSummary(storeId);
  }

  @Get('top')
  getTopProducts(
    @Param('storeId') storeId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.productsService.getTopProducts(storeId, limit);
  }

  @Get(':productId')
  getProduct(@Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.productsService.getProduct(storeId, productId);
  }
}
