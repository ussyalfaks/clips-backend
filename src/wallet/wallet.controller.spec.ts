import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { StellarService } from '../stellar/stellar.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { ExecutionContext } from '@nestjs/common';

describe('WalletController', () => {
  let controller: WalletController;
  let stellarService: StellarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            getWalletsByUserId: jest.fn(),
            getWalletById: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            validateAddress: jest.fn(),
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
    stellarService = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validateWallet', () => {
    it('should call stellarService.validateAddress with the provided address', () => {
      const address = 'GBAH...';
      const mockResult = { valid: true };
      jest.spyOn(stellarService, 'validateAddress').mockReturnValue(mockResult);

      const result = controller.validateWallet(address);

      expect(stellarService.validateAddress).toHaveBeenCalledWith(address);
      expect(result).toBe(mockResult);
    });
  });
});
