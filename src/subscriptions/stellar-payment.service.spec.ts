import { Test, TestingModule } from '@nestjs/testing';
import { StellarPaymentService } from './stellar-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateStellarSubscriptionDto } from './dto/create-stellar-subscription.dto';

// Mock the Stellar SDK to avoid import issues in tests
jest.mock('@stellar/stellar-sdk', () => ({
  Server: jest.fn(),
}));

describe('StellarPaymentService', () => {
  let service: StellarPaymentService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    wallet: {
      findFirst: jest.fn(),
    },
    stellarPaymentIntent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarPaymentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StellarPaymentService>(StellarPaymentService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent successfully', async () => {
      const userId = 1;
      const dto: CreateStellarSubscriptionDto = {
        plan: 'pro',
        asset: 'xlm',
        amount: 10,
        walletId: '1',
      };

      const mockWallet = {
        id: 1,
        userId: 1,
        address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
      };

      const mockPaymentIntent = {
        id: 'test-intent-id',
        userId: 1,
        amount: 10,
        asset: 'xlm',
        destination: mockWallet.address,
        memo: 'CLIPS-1-abc123-def456',
        status: 'pending',
        expiresAt: new Date(),
        plan: 'pro',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
      mockPrismaService.stellarPaymentIntent.create.mockResolvedValue(mockPaymentIntent);

      const result = await service.createPaymentIntent(userId, dto);

      expect(result).toEqual({
        id: 'test-intent-id',
        amount: 10,
        asset: 'xlm',
        destination: mockWallet.address,
        memo: 'CLIPS-1-abc123-def456',
        expiresAt: mockPaymentIntent.expiresAt,
        status: 'pending',
      });
    });

    it('should throw error if wallet not found', async () => {
      const userId = 1;
      const dto: CreateStellarSubscriptionDto = {
        plan: 'pro',
        asset: 'xlm',
        amount: 10,
      };

      mockPrismaService.wallet.findFirst.mockResolvedValue(null);

      await expect(service.createPaymentIntent(userId, dto)).rejects.toThrow(
        'Stellar wallet not found. Please connect a wallet first.',
      );
    });
  });

  describe('getPendingPaymentIntents', () => {
    it('should return pending payment intents', async () => {
      const userId = 1;
      const mockIntents = [
        {
          id: 'intent1',
          userId: 1,
          amount: 10,
          asset: 'xlm',
          status: 'pending',
          expiresAt: new Date(Date.now() + 10000),
        },
      ];

      mockPrismaService.stellarPaymentIntent.findMany.mockResolvedValue(mockIntents);

      const result = await service.getPendingPaymentIntents(userId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'intent1',
        amount:10,
        asset: 'xlm',
        destination: undefined,
        memo: undefined,
        expiresAt: mockIntents[0].expiresAt,
        status: 'pending',
      });
    });
  });

  describe('processExpiredPaymentIntents', () => {
    it('should update expired intents', async () => {
      mockPrismaService.stellarPaymentIntent.updateMany.mockResolvedValue({ count: 1 });

      await service.processExpiredPaymentIntents();

      expect(mockPrismaService.stellarPaymentIntent.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          expiresAt: { lt: new Date() },
        },
        data: {
          status: 'expired',
        },
      });
    });
  });
});
