import { AuthService } from '../services/auth.service';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto, LogoutDto } from '../dto/auth.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    sendOtp(dto: SendOtpDto): Promise<{
        message: string;
        expiresAt: Date;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        user: any;
        accessToken: string;
        refreshToken: string;
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(dto: LogoutDto): Promise<{
        message: string;
    }>;
    logoutAll(body: {
        userId: string;
    }): Promise<{
        message: string;
    }>;
    validate(body: {
        userId: string;
    }): Promise<any>;
}
