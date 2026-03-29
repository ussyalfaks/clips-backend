import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';

describe('WalletService', () => {
  let service: WalletService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    wallet: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('maskAddress', () => {
    it('should mask address correctly', () => {
      const address = 'GD5PMJ5L6KXW5M7QJ4G2O5E7BPH3YUSNL5HG6';
      const masked = service.maskAddress(address);
      expect(masked).toBe('******NL5HG6');
    });

    it('should handle short addresses', () => {
      const address = 'ABCDEF';
      const masked = service.maskAddress(address);
      expect(masked).toBe('ABCDEF');
    });

    it('should handle empty address', () => {
      const masked = service.maskAddress('');
      expect(masked).toBe('');
    });

    it('should handle null address', () => {
      const masked = service.maskAddress(null as any);
      expect(masked).toBe('');
    });
  });

  describe('getWalletsByUserId', () => {
    it('should return masked wallets for user', async () => {
      const mockWallets = [
        { id: 1, userId: 1, address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H', chain: 'stellar', type: 'freighter' },
        { id: 2, userId: 1, address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7I', chain: 'stellar', type: 'albedo' },
      ];

      mockPrismaService.wallet.findMany.mockResolvedValue(mockWallets);

      const result = await service.getWalletsByUserId(1);

      expect(result).toHaveLength(2);
      expect(result[0].address).toBe('******AQDZ7H');
      expect(result[1].address).toBe('******AQDZ7I');
      expect(mockPrismaService.wallet.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });
  });

  describe('getWalletById', () => {
    it('should return masked wallet for valid user', async () => {
      const mockWallet = { id: 1, userId: 1, address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H', chain: 'stellar', type: 'freighter' };
      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);

      const result = await service.getWalletById(1, 1);

      expect(result.address).toBe('******AQDZ7H');
      expect(mockPrismaService.wallet.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
      });
    });

    it('should throw NotFoundException for non-existent wallet', async () => {
      mockPrismaService.wallet.findFirst.mockResolvedValue(null);

      await expect(service.getWalletById(999, 1)).rejects.toThrow('Wallet 999 not found');
    });

    it('should throw NotFoundException for wrong user', async () => {
      mockPrismaService.wallet.findFirst.mockResolvedValue(null);

      await expect(service.getWalletById(1, 999)).rejects.toThrow('Wallet 1 not found');
    });
  });

  describe('connectWallet', () => {
    const validStellarDto: ConnectWalletDto = {
      address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
      chain: 'stellar',
      type: 'freighter',
    };

    it('should connect new Stellar wallet successfully', async () => {
      const mockWallet = { id: 1, userId: 1, ...validStellarDto, connectedAt: new Date() };
      mockPrismaService.wallet.findFirst.mockResolvedValue(null);
      mockPrismaService.wallet.create.mockResolvedValue(mockWallet);

      const result = await service.connectWallet(1, validStellarDto);

      expect(result.address).toBe('******AQDZ7H');
      expect(mockPrismaService.wallet.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, address: validStellarDto.address },
      });
      expect(mockPrismaService.wallet.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          address: validStellarDto.address,
          chain: validStellarDto.chain,
          type: validStellarDto.type,
        },
      });
    });

    it('should update existing wallet', async () => {
      const existingWallet = { id: 1, userId: 1, address: validStellarDto.address, type: 'old-type' };
      const updatedWallet = { ...existingWallet, type: validStellarDto.type, updatedAt: new Date() };
      
      mockPrismaService.wallet.findFirst.mockResolvedValue(existingWallet);
      mockPrismaService.wallet.update.mockResolvedValue(updatedWallet);

      const result = await service.connectWallet(1, validStellarDto);

      expect(result.address).toBe('******AQDZ7H');
      expect(mockPrismaService.wallet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          chain: validStellarDto.chain,
          type: validStellarDto.type,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should reject invalid Stellar address', async () => {
      const invalidDto = { ...validStellarDto, address: 'invalid-address' };

      await expect(service.connectWallet(1, invalidDto)).rejects.toThrow('Invalid Stellar address');
    });

    it('should reject invalid Base address', async () => {
      const invalidBaseDto = {
        address: 'invalid-address',
        chain: 'base',
        type: 'metamask',
      };

      await expect(service.connectWallet(1, invalidBaseDto)).rejects.toThrow('Invalid Base address');
    });

    it('should accept valid Base address', async () => {
      const validBaseDto = {
        address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db42',
        chain: 'base',
        type: 'metamask',
      };
      const mockWallet = { id: 1, userId: 1, ...validBaseDto, connectedAt: new Date() };
      
      mockPrismaService.wallet.findFirst.mockResolvedValue(null);
      mockPrismaService.wallet.create.mockResolvedValue(mockWallet);

      const result = await service.connectWallet(1, validBaseDto);

      expect(result.address).toBe('******b4Db42');
    });
  });
});
