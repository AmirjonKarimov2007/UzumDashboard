# Uzum Auth Service

Production-ready authentication service with phone number login, OTP verification, JWT tokens, and session management.

## Features

- ✅ Phone number-based authentication
- ✅ OTP verification (SMS)
- ✅ JWT access tokens (15min expiry)
- ✅ Refresh tokens (7 days expiry)
- ✅ Session management (Redis)
- ✅ Multi-device support
- ✅ Audit logging
- ✅ Rate limiting (built-in)
- ✅ Protected routes
- ✅ Auto-registration on first login

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Frontend)                        │
│  Send OTP → Verify OTP → Store Tokens                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Auth Service (NestJS)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Auth    │  │   OTP    │  │ Session  │  │   SMS    │  │
│  │  Module  │  │  Service │  │  Service │  │  Service │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────────┐
│   PostgreSQL     │ │  Redis   │ │     SMS Gateway   │
│  (Users, Stores, │ │(Sessions)│ │   (Twilio/Essek)  │
│   Tokens, OTPs)  │ │          │ │                   │
└──────────────────┘ └──────────┘ └──────────────────┘
```

## Database Schema

### Users
```prisma
model User {
  id        String   @id @default(uuid())
  phone     String   @unique
  email     String?  @unique
  password  String?
  name      String?
  avatar    String?
  isActive  Boolean  @default(true)
  stores    Store[]
  sessions  Session[]
  otps      Otp[]
  refreshTokens RefreshToken[]
  auditLogs AuditLog[]
}
```

### Stores (Multi-tenancy)
```prisma
model Store {
  id        String   @id @default(uuid())
  userId    String
  name      String
  status    StoreStatus @default(ACTIVE)
  plan      Plan       @default(FREE)
}
```

### OTP Verification
```prisma
model Otp {
  id        String   @id @default(uuid())
  phone     String
  code      String   // Hashed
  type      OtpType
  expiresAt DateTime // 5 minutes
  attempts  Int      @default(0)
  maxAttempts Int    @default(5)
}
```

## API Endpoints

### Public Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/send-otp` | Send OTP to phone |
| POST | `/auth/verify-otp` | Verify OTP & login |
| POST | `/auth/refresh` | Refresh access token |

### Protected Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/logout` | Logout from current device |
| POST | `/auth/logout-all` | Logout from all devices |
| POST | `/auth/validate` | Validate access token |

## Authentication Flow

### 1. Send OTP
```bash
POST /auth/send-otp
{
  "phone": "+998901234567"
}

Response:
{
  "message": "OTP sent successfully",
  "expiresAt": "2026-05-20T15:15:00Z"
}
```

### 2. Verify OTP & Login
```bash
POST /auth/verify-otp
{
  "phone": "+998901234567",
  "code": "123456",
  "device": {
    "type": "mobile",
    "os": "iOS",
    "browser": "Safari"
  },
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}

Response:
{
  "user": {
    "id": "uuid",
    "phone": "+998901234567",
    "name": "User Name",
    "stores": [...]
  },
  "accessToken": "jwt_token",
  "refreshToken": "refresh_token"
}
```

### 3. Refresh Token
```bash
POST /auth/refresh
{
  "refreshToken": "refresh_token"
}

Response:
{
  "accessToken": "new_jwt_token",
  "refreshToken": "new_refresh_token"
}
```

### 4. Logout
```bash
POST /auth/logout
{
  "refreshToken": "refresh_token",
  "userId": "uuid"
}
```

## Security Features

### 1. Token Rotation
- Old refresh token is revoked on refresh
- New tokens generated each time

### 2. Session Management
- Sessions stored in Redis
- Track active devices
- Support logout from all devices

### 3. OTP Security
- 5-minute expiry
- Max 5 attempts
- Attempt tracking
- Hashed codes

### 4. Audit Logging
- All auth events logged
- IP and device tracking
- Failed attempt monitoring

### 5. Rate Limiting
- Built-in OTP rate limiting
- Prevent brute force attacks

## Setup

### 1. Environment Variables
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/uzum_auth"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# SMS
SMS_PROVIDER=twilio
SMS_TWILIO_ACCOUNT_SID=your_sid
SMS_TWILIO_AUTH_TOKEN=your_token
SMS_TWILIO_PHONE_NUMBER=+1234567890
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Migrations
```bash
npm run prisma:migrate
npm run prisma:generate
```

### 4. Start Service
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Testing

### Send OTP
```bash
curl -X POST http://localhost:3001/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998901234567"}'
```

### Verify OTP (Demo mode: code is logged)
```bash
curl -X POST http://localhost:3001/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998901234567","code":"123456"}'
```

### Refresh Token
```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"your_refresh_token"}'
```

## Integration with Frontend

### Frontend API Client
```typescript
// services/auth.service.ts
export const authService = {
  sendOtp: (phone: string) =>
    fetch('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string) =>
    fetch('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),
};
```

### Store Tokens
```typescript
// stores/auth-store.ts
export const useAuthStore = create((set) => ({
  accessToken: null,
  refreshToken: null,
  setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
  clearTokens: () => set({ accessToken: null, refreshToken: null }),
}));
```

## Production Checklist

- [ ] Change JWT_SECRET to strong random string
- [ ] Enable HTTPS
- [ ] Configure CORS origins properly
- [ ] Set up real SMS provider (Twilio/Essek)
- [ ] Enable rate limiting middleware
- [ ] Set up log aggregation
- [ ] Configure backup strategy
- [ ] Enable audit log retention
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure SSL/TLS for PostgreSQL and Redis

## Tech Stack

- **Framework**: NestJS 10
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis (ioredis)
- **Auth**: Passport JWT
- **Validation**: class-validator
- **SMS**: Twilio (configurable)

## License

Private - © Uzum