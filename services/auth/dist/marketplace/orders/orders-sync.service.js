"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrdersSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const date_fns_1 = require("date-fns");
let OrdersSyncService = OrdersSyncService_1 = class OrdersSyncService {
    constructor(prisma, uzumClient) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.logger = new common_1.Logger(OrdersSyncService_1.name);
    }
    async syncOrders(storeId, uzumShopId, apiKey, dateFrom, dateTo) {
        const from = dateFrom || (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 90), 'yyyy-MM-dd');
        const to = dateTo || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        this.logger.log(`Syncing orders for store ${storeId} from ${from} to ${to}`);
        const uzumOrders = await this.uzumClient.getAllOrders(storeId, apiKey, [uzumShopId], from, to);
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
                scheme: o.deliverySchema === 'DBS' ? 'DBS' : 'FBS',
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
            if (o.orderItems?.length) {
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
    mapOrderStatus(status) {
        const validStatuses = [
            'CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING',
            'DELIVERED', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT',
            'COMPLETED', 'CANCELED', 'PENDING_CANCELLATION', 'RETURNED',
        ];
        const upper = status?.toUpperCase();
        return validStatuses.includes(upper) ? upper : 'CREATED';
    }
};
exports.OrdersSyncService = OrdersSyncService;
exports.OrdersSyncService = OrdersSyncService = OrdersSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient])
], OrdersSyncService);
//# sourceMappingURL=orders-sync.service.js.map