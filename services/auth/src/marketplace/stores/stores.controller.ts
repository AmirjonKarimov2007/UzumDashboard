import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoresService } from './stores.service';
import { ConnectStoreDto, UpdateConnectionDto, CreateStoreDto } from './dto/stores.dto';

@Controller('marketplace/stores')
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  getStores(@CurrentUser('id') userId: string) {
    return this.storesService.getStores(userId);
  }

  @Get(':storeId')
  getStore(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    return this.storesService.getStore(userId, storeId);
  }

  @Post(':storeId/connect')
  connectStore(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: ConnectStoreDto,
  ) {
    return this.storesService.connectStore(userId, storeId, dto);
  }

  @Post(':storeId/disconnect')
  disconnectStore(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    return this.storesService.disconnectStore(userId, storeId);
  }

  @Get(':storeId/test-connection')
  testConnection(@CurrentUser('id') userId: string, @Param('storeId') storeId: string) {
    return this.storesService.testConnection(userId, storeId);
  }

  @Patch(':storeId/connection-settings')
  updateConnectionSettings(
    @CurrentUser('id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.storesService.updateConnectionSettings(userId, storeId, dto);
  }
}
