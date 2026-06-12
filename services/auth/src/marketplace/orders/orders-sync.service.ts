import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
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
      // v2 FBS order prices are already in soʻm (not tiyin). The FBS order list
      // does not break out commission/delivery/discount — those come from the
      // finance API — so we record the order total and leave the rest at 0.
      const total = o.price || 0;
      const subtotal = total;
      const commission = 0;
      const deliveryFee = 0;
      const discount = 0;
      const profit = total;

      const orderData = {
        storeId,
        orderNumber: o.publicId || null,
        scheme: o.scheme === 'DBS' ? 'DBS' : ('FBS' as any),
        status: this.mapOrderStatus(o.status),
        // deliveryInfo is null for FBS orders (customer is hidden); populated
        // only for DBS. Guarded so both schemes map safely.
        customerName: o.deliveryInfo?.customerFullname || null,
        customerPhone: o.deliveryInfo?.customerPhone || null,
        deliveryAddress: o.deliveryInfo?.deliveryAddress || null,
        deliveryCity: o.deliveryInfo?.city || null,
        subtotal,
        commission,
        deliveryFee,
        discount,
        total,
        profit,
        orderedAt: o.dateCreated ? new Date(o.dateCreated) : null,
      };

      const order = await this.prisma.order.upsert({
        where: { uzumOrderId: String(o.id) },
        create: {
          ...orderData,
          uzumOrderId: String(o.id),
        },
        update: orderData,
      });

      // Upsert order items
      if (o.orderItems?.length) {
        // Remove existing items and re-insert
        await this.prisma.orderItem.deleteMany({ where: { orderId: order.id } });

        for (const item of o.orderItems) {
          // v2 order items have no skuId — link to the catalog by uzumProductId
          // (best-effort; a product may have several SKUs). The barcode is the
          // most stable per-variant identifier available, so store it.
          const product = item.productId
            ? await this.prisma.product.findFirst({
                where: { storeId, uzumProductId: String(item.productId) },
              })
            : null;

          const qty = item.amount || 1;
          const price = item.price || 0;

          await this.prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product?.id || null,
              uzumSkuId: String(item.barcode ?? item.id),
              name: item.title || item.skuTitle || 'Unknown',
              quantity: qty,
              price,
              total: price * qty,
            },
          });
        }
      }

      synced++;
    }

    this.logger.log(`Synced ${synced} orders for store ${storeId}`);

    // NOTE: new-order Telegram notifications are handled by TelegramOrderPoller
    // (queue-independent), so they keep working even when the BullMQ/Redis sync
    // pipeline is down. We deliberately do NOT notify here to avoid duplicates.

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
