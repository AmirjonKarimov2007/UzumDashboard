export declare const jwtConfig: (() => {
    secret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    secret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
}>;
