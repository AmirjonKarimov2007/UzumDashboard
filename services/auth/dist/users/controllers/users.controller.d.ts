import { UsersService } from '../users.service';
export declare class UpdateProfileDto {
    name?: string;
    email?: string;
    avatar?: string;
}
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getMe(userId: string): Promise<{
        id: string;
        phone: string;
        email: string | null;
        name: string | null;
        avatar: string | null;
        isActive: boolean;
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
    updateMe(userId: string, dto: UpdateProfileDto): Promise<{
        id: string;
        phone: string;
        email: string | null;
        name: string | null;
        avatar: string | null;
    }>;
}
