import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftController } from './nft.controller';
import { NftRoyaltyService } from './nft-royalty.service';

describe('NftController', () => {
  let controller: NftController;
  let service: NftRoyaltyService;

  const mockRecipientAddress = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const mockTokenId = '42';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftController],
      providers: [
        {
          provide: NftRoyaltyService,
          useValue: {
            queryRoyalty: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NftController>(NftController);
    service = module.get<NftRoyaltyService>(NftRoyaltyService);
  });

  describe('getRoyalty', () => {
    it('should return royalty data for valid token ID', async () => {
      const mockData = {
        royaltyBps: 1000,
        recipient: mockRecipientAddress,
      };

      (service.queryRoyalty as jest.Mock).mockResolvedValue(mockData);

      const result = await controller.getRoyalty(mockTokenId);

      expect(result).toEqual(mockData);
      expect(service.queryRoyalty).toHaveBeenCalledWith(mockTokenId);
    });

    it('should throw BadRequestException for empty mintAddress', async () => {
      await expect(controller.getRoyalty('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for whitespace-only mintAddress', async () => {
      await expect(controller.getRoyalty('   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent token', async () => {
      (service.queryRoyalty as jest.Mock).mockRejectedValue(
        new NotFoundException('Token not found'),
      );

      await expect(controller.getRoyalty(mockTokenId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should trim whitespace from mintAddress', async () => {
      const mockData = {
        royaltyBps: 1500,
        recipient: mockRecipientAddress,
      };

      (service.queryRoyalty as jest.Mock).mockResolvedValue(mockData);

      const result = await controller.getRoyalty(`  ${mockTokenId}  `);

      expect(result).toEqual(mockData);
      expect(service.queryRoyalty).toHaveBeenCalledWith(mockTokenId);
    });
  });
});
