import { BadRequestException } from '@nestjs/common';
import { StoresService } from './stores.service';

describe('StoresService Smartup settings', () => {
  function fixture(initialClientId: string | null = null, defaultClientId = 'DEFAULT-CLIENT') {
    let smartupClientId = initialClientId;
    const prisma: any = {
      store: {
        findFirst: jest.fn(async () => ({ id: 'store-1', name: 'Asosiy do\'kon', smartupClientId })),
        update: jest.fn(async ({ data }) => {
          smartupClientId = data.smartupClientId;
          return { id: 'store-1', smartupClientId };
        }),
      },
      auditLog: { create: jest.fn(async ({ data }) => data) },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    };
    const config: any = { get: jest.fn((key) => key === 'SMARTUP_PERSON_CODE' ? defaultClientId : undefined) };
    const service = new StoresService(prisma, {} as any, config);
    return { service, prisma };
  }

  it('uses the server default only until a store-specific client is saved', async () => {
    const { service, prisma } = fixture();

    await expect(service.getSmartupSettings('user-1', 'store-1')).resolves.toMatchObject({
      clientId: null,
      effectiveClientId: 'DEFAULT-CLIENT',
      usesDefault: true,
    });

    await expect(service.updateSmartupSettings('user-1', 'store-1', { clientId: '  CLIENT-77  ' }))
      .resolves.toMatchObject({
        clientId: 'CLIENT-77',
        effectiveClientId: 'CLIENT-77',
        usesDefault: false,
      });
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { smartupClientId: 'CLIENT-77' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SMARTUP_CLIENT_UPDATED', entityId: 'store-1' }),
    }));
  });

  it('blocks Smartup import when neither store nor server has a client ID', async () => {
    const { service } = fixture(null, '');
    await expect(service.resolveSmartupClientId('user-1', 'store-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
