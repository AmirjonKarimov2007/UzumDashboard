export declare class SendOtpDto {
    phone: string;
}
export declare class VerifyOtpDto {
    phone: string;
    code: string;
    device?: {
        type?: string;
        os?: string;
        browser?: string;
    };
    ipAddress?: string;
    userAgent?: string;
}
export declare class TelegramLoginDto {
    initData: string;
    device?: {
        type?: string;
        os?: string;
        browser?: string;
    };
    ipAddress?: string;
    userAgent?: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class LogoutDto {
    refreshToken: string;
    userId: string;
}
