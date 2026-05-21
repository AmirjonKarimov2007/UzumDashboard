export declare class SessionService {
    private redis;
    constructor();
    createSession(data: {
        userId: string;
        token: string;
        device?: any;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<void>;
    getSession(token: string): Promise<any | null>;
    deleteSession(token: string): Promise<void>;
    deleteAllSessions(userId: string): Promise<void>;
    getUserSessions(userId: string): Promise<any[]>;
}
