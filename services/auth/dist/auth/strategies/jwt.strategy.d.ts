import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private config;
    private prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    validate(payload: any): Promise<{
        id: string;
        phone: string;
        name: string | null;
        avatar: string | null;
        stores: {
            id: string;
            createdAt: Date;
            userId: string;
            name: string;
            updatedAt: Date;
            domain: string | null;
            logo: string | null;
            status: import(".prisma/client").$Enums.StoreStatus;
            plan: import(".prisma/client").$Enums.Plan;
        }[];
    }>;
}
export {};
