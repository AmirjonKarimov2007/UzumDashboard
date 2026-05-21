import { PrismaService } from '../common/database/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findById(id: string): Promise<({
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
    } & {
        phone: string;
        id: string;
        createdAt: Date;
        name: string | null;
        email: string | null;
        password: string | null;
        avatar: string | null;
        isActive: boolean;
        updatedAt: Date;
    }) | null>;
    findByPhone(phone: string): Promise<({
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
    } & {
        phone: string;
        id: string;
        createdAt: Date;
        name: string | null;
        email: string | null;
        password: string | null;
        avatar: string | null;
        isActive: boolean;
        updatedAt: Date;
    }) | null>;
    updateProfile(userId: string, data: {
        name?: string;
        avatar?: string;
    }): Promise<{
        phone: string;
        id: string;
        createdAt: Date;
        name: string | null;
        email: string | null;
        password: string | null;
        avatar: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
    deactivateUser(userId: string): Promise<{
        phone: string;
        id: string;
        createdAt: Date;
        name: string | null;
        email: string | null;
        password: string | null;
        avatar: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
    getUserSessions(userId: string): Promise<{
        id: string;
        expiresAt: Date;
        createdAt: Date;
        userId: string;
        ipAddress: string | null;
        userAgent: string | null;
        token: string;
    }[]>;
}
