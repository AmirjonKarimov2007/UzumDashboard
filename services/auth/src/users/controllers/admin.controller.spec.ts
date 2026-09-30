import { Test } from '@nestjs/testing';
import { UnauthorizedException, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PrismaService } from '../../common/database/prisma.service';
import { encrypt } from '../../common/utils/crypto.util';
import { SessionService } from '../../sessions/sessions.service';

describe('Super-admin HTTP authorization', () => {
  let app: INestApplication;
  let base: string;
  let identity: { id: string; phone: string } | null;
  const secret = 'a'.repeat(32);
  const encrypted = encrypt('fixture-api-key', secret);
  const targetUser = { id: 'target', phone: '+998901234567', name: 'Target', isActive: true, stores: [] };
  const db = {
    user: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id === 'target' ? targetUser : null)),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    store: { count: jest.fn().mockResolvedValue(3) },
    storeConnection: { count: jest.fn().mockResolvedValue(2), findUnique: jest.fn().mockResolvedValue({
      apiKeyEncrypted: encrypted.encrypted, apiKeyIv: encrypted.iv, apiKeyTag: encrypted.tag,
    }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('impersonation-token') };
  const sessions = { deleteAllSessions: jest.fn().mockResolvedValue(undefined) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [SuperAdminGuard,
      { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: { get: () => secret } },
      { provide: JwtService, useValue: jwt }, { provide: SessionService, useValue: sessions },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      if (!identity) throw new UnauthorizedException();
      context.switchToHttp().getRequest().user = identity;
      return true;
    } }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => { if (app) await app.close(); });
  beforeEach(() => { identity = null; jest.clearAllMocks(); });
  it('rejects unauthenticated requests', async () => {
    expect((await fetch(base + '/admin/users')).status).toBe(401);
  });
  it('rejects ordinary users even with forged role/phone headers', async () => {
    identity = { id: 'ordinary', phone: '+998900000000' };
    for (const path of ['/admin/users', '/admin/stores/another-store/api-key']) {
      expect((await fetch(base + path, { headers: { 'x-role': 'SUPER_ADMIN', 'x-phone': '+998917897621' } })).status).toBe(403);
    }
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.storeConnection.findUnique).not.toHaveBeenCalled();
  });
  it('returns user/store totals to the owner without selecting any encrypted key fields', async () => {
    identity = { id: 'owner', phone: '+998917897621' };
    const response = await fetch(base + '/admin/users');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totalUsers: 2, totalStores: 3 });
    expect(JSON.stringify(db.user.findMany.mock.calls)).not.toContain('apiKey');
  });
  it('reveals a key on a protected no-store endpoint and audits without the secret', async () => {
    identity = { id: 'owner', phone: '+998917897621' };
    const response = await fetch(base + '/admin/stores/store-id/api-key');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ apiKey: 'fixture-api-key' });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('fixture-api-key');
  });
  it('blocks a target user and revokes every refresh session', async () => {
    identity = { id: 'owner', phone: '+998917897621' };
    const response = await fetch(base + '/admin/users/target/status', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive: false }),
    });
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(db.refreshToken.updateMany).toHaveBeenCalled();
    expect(sessions.deleteAllSessions).toHaveBeenCalledWith('target');
  });
  it('issues a short-lived audited dashboard inspection token', async () => {
    identity = { id: 'owner', phone: '+998917897621' };
    const response = await fetch(base + '/admin/users/target/impersonate', { method: 'POST' });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ accessToken: 'impersonation-token', expiresIn: 7200 });
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: 'target', impersonatedBy: 'owner' }), { expiresIn: '2h' });
  });
  it('never lets the super-admin delete their own account', async () => {
    identity = { id: 'owner', phone: '+998917897621' };
    const response = await fetch(base + '/admin/users/owner', { method: 'DELETE' });
    expect(response.status).toBe(400);
    expect(db.user.delete).not.toHaveBeenCalled();
  });
});
