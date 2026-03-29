import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintController } from './nft-mint.controller';
import { NftMintService } from './nft-mint.service';

describe('NftMintController', () => {
  let controller: NftMintController;
  let service: NftMintService;

  const mockClipId = 1;
  const mockWalletAddress = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const mockMintResponse = {
    xdr: 'base64_xdr_string',
    clipId: mockClipId,
    tokenId: mockClipId,
    metadataUri: 'ipfs://QmXxxx',
    to: mockWalletAddress,
    contractId: 'CAYYYYYYYYYYYYYYYYYYY',
    network: 'testnet',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftMintController],
      providers: [
        {
          provide: NftMintService,
          useValue: {
            prepareMintTx: jest.fn(),
            recordMint: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NftMintController>(NftMintController);
    service = module.get<NftMintService>(NftMintService);
  });

  describe('prepareMint', () => {
    it('should throw BadRequestException for non-numeric clipId', async () => {
      await expect(
        controller.prepareMint('not-a-number', {
          walletAddress: mockWalletAddress,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if walletAddress missing', async () => {
      await expect(
        controller.prepareMint(mockClipId.toString(), {
          walletAddress: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return mint transaction response for valid inputs', async () => {
      (service.prepareMintTx as jest.Mock).mockResolvedValue(mockMintResponse);

      const result = await controller.prepareMint(mockClipId.toString(), {
        walletAddress: mockWalletAddress,
      });

      expect(result).toEqual(mockMintResponse);
      expect(service.prepareMintTx).toHaveBeenCalledWith(
        mockClipId,
        mockWalletAddress,
      );
    });

    it('should throw NotFoundException if clip not found', async () => {
      (service.prepareMintTx as jest.Mock).mockRejectedValue(
        new NotFoundException('Clip not found'),
      );

      await expect(
        controller.prepareMint(mockClipId.toString(), {
          walletAddress: mockWalletAddress,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmMint', () => {
    it('should throw BadRequestException for non-numeric clipId', async () => {
      await expect(
        controller.confirmMint('not-a-number', {
          txHash: 'hash',
          mintAddress: 'address',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if txHash missing', async () => {
      await expect(
        controller.confirmMint(mockClipId.toString(), {
          txHash: '',
          mintAddress: 'address',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if mintAddress missing', async () => {
      await expect(
        controller.confirmMint(mockClipId.toString(), {
          txHash: 'hash',
          mintAddress: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record mint successfully', async () => {
      (service.recordMint as jest.Mock).mockResolvedValue(undefined);

      const result = await controller.confirmMint(mockClipId.toString(), {
        txHash: 'hash',
        mintAddress: 'address',
      });

      expect(result).toEqual({
        success: true,
        message: `Mint recorded for clip ${mockClipId}`,
      });
      expect(service.recordMint).toHaveBeenCalledWith(mockClipId, 'hash', 'address');
    });
  });
});
