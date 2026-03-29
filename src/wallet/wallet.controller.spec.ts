import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { StellarService } from '../stellar/stellar.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { ExecutionContext } from '@nestjs/common';
import { ConnectWalletDto } from './dto/connect-wallet.dto';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: WalletService;
  let stellarService: StellarService;

  const mockRequest = (userId: number) => ({
    user: { id: userId },
  } as any);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            connectWallet: jest.fn(),
            getWalletsByUserId: jest.fn(),
            getWalletById: jest.fn(),
            getWalletBalance: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            validateAddress: jest.fn(),
            getAccountBalance: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(LoginGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => true,
      })
      .compile();

    controller = module.get<WalletController>(WalletController);
    walletService = module.get<WalletService>(WalletService);
    stellarService = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validateWallet', () => {
    it('should validate a Stellar address', async () => {
      const address = 'GBXZFVGP3QW5NXVZ4KPRQ';
      (stellarService.validateAddress as jest.Mock).mockReturnValue({ valid: true });

      const result = await controller.validateWallet(address);

      expect(result).toEqual({ valid: true });
      expect(stellarService.validateAddress).toHaveBeenCalledWith(address);
    });

    it('should reject an invalid Stellar address', async () => {
      const address = 'invalid-address';
      (stellarService.validateAddress as jest.Mock).mockReturnValue({
        valid: false,
        message: 'Invalid Stellar address format',
      });

      const result = await controller.validateWallet(address);

      expect(result).toEqual({
        valid: false,
        message: 'Invalid Stellar address format',
      });
    });
  });

  describe('connectWallet', () => {
    it('should connect a wallet successfully', async () => {
      const dto: ConnectWalletDto = {
        address: 'GBXZFVGP3QW5NXVZ4KPRQ',
        chain: 'stellar',
        type: 'freighter',
      };
      const mockWallet = {
        id: 1,
        userId: 1,
        ...dto,
        connectedAt: new Date(),
        address: '******Z4KPRQ', // Masked
      };

      (walletService.connectWallet as jest.Mock).mockResolvedValue(mockWallet);

      const result = await controller.connectWallet(dto, mockRequest(1));

      expect(result).toEqual(mockWallet);
      expect(walletService.connectWallet).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('getWallets', () => {
    it('should return user wallets', async () => {
      const mockWallets = [
        { id: 1, address: '******NXVZ4KPRQ' },
        { id: 2, address: '******7890ABCD' },
      ];

      (walletService.getWalletsByUserId as jest.Mock).mockResolvedValue(mockWallets);

      const result = await controller.getWallets(mockRequest(1));

      expect(result).toEqual(mockWallets);
      expect(walletService.getWalletsByUserId).toHaveBeenCalledWith(1);
    });
  });

  describe('getWallet', () => {
    it('should return a specific wallet', async () => {
      const mockWallet = {
        id: 1,
        address: '******Z4KPRQ',
        chain: 'stellar',
        type: 'freighter',
      };

      (walletService.getWalletById as jest.Mock).mockResolvedValue(mockWallet);

      const result = await controller.getWallet('1', mockRequest(1));

      expect(result).toEqual(mockWallet);
      expect(walletService.getWalletById).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('getWalletBalance', () => {
    it('should return wallet balance', async () => {
      const mockBalance = {
        address: 'GBXZFVGP3QW5NXVZ4KPRQ',
        balance: 100.5,
        asset: 'XLM',
        warning: null,
      };

      (walletService.getWalletBalance as jest.Mock).mockResolvedValue(mockBalance);

      const result = await controller.getWalletBalance('1', mockRequest(1));

      expect(result).toEqual(mockBalance);
      expect(walletService.getWalletBalance).toHaveBeenCalledWith(
        1,
        1,
        stellarService,
      );
    });
  });
});
