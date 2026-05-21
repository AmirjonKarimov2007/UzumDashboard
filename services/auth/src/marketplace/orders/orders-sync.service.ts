import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient, UzumOrder } from '../../uzum/client/uzum-api.client';
import { subDays, format } from 'date-fns';

@Injectable()
export class OrdersSyncService {
  private readonly logger = new Logger(OrdersSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
  ) {}

  async syncOrders(
    storeId: string,
    uzumShopId: string,
    apiKey: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<number> {
    // Default: last 90 days for initial sync, last 7 days for incremental
    const from = dateFrom || format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const to = dateTo || format(new Date(), 'yyyy-MM-dd');

    this.logger.log(`Syncing orders for store ${storeId} from ${from} to ${to}`);

    const uzumOrders = await this.uzumClient.getAllOrders(
      storeId,
      apiKey,
      [uzumShopId],
      from,
      to,
    );

    if (!uzumOrders.length) {
      this.logger.log(`No orders returned for store ${storeId}`);
      return 0;
    }

    let synced = 0;

    for (const o of uzumOrders) {
      const subtotal = (o.financialInfo?.totalAmount || 0) / 100;
      const commission = (o.financialInfo?.commission || 0) / 100;
      const deliveryFee = (o.financialInfo?.deliveryPrice || 0) / 100;
      const discount = (o.financialInfo?.discount || 0) / 100;
      const total = subtotal;
      const profit = subtotal - commission - deliveryFee;

      const orderData = {
        storeId,
        scheme: o.deliverySchema === 'DBS' ? 'DBS' : ('FBS' as any),
        status: this.mapOrderStatus(o.status),
        customerName: o.deliveryInfo?.customerFullName || null,
        customerPhone: o.deliveryInfo?.customerPhone || null,
        deliveryAddress: o.deliveryInfo?.deliveryAddress || null,
        deliveryCity: o.deliveryInfo?.city || null,
        subtotal,
        commission,
        deliveryFee,
        discount,
        total,
        profit,
        orderedAt: o.orderDate ? new Date(o.orderDate) : null,
      };

      const order = await this.prisma.order.upsert({
        where: { uzumOrderId: String(o.orderId) },
        create: {
          ...orderData,
          uzumOrderId: String(o.orderId),
        },
        update: orderData,
      });

      // Upsert order items
      if (o.orderItems?.length) {
        // Remove existing items and re-insert
        await this.prisma.orderItem.deleteMany({ where: { orderId: order.id } });

        for (const item of o.orderItems) {
          const product = await this.prisma.product.findFirst({
            where: { storeId, uzumSkuId: String(item.skuId) },
          });

          await this.prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product?.id || null,
              uzumSkuId: String(item.skuId),
              name: item.skuTitle || 'Unknown',
              quantity: item.qty || 1,
              price: (item.price || 0) / 100,
              total: (item.totalPrice || 0) / 100,
            },
          });
        }
      }

      synced++;
    }

    this.logger.log(`Synced ${synced} orders for store ${storeId}`);
    return synced;
  }

  private mapOrderStatus(status: string): any {
    const validStatuses = [
      'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
      'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
      'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
    ];
    const upper = status?.toUpperCase();
    return validStatuses.includes(upper) ? upper : 'CREATED';
  }
}
