import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { NftMintService } from './nft-mint.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk');

describe('NftMintService', () => {
  let service: NftMintService;
  let prisma: PrismaService;
  let stellarService: StellarService;

  const mockClipId = 1;
  const mockWalletAddress = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const mockMetadataUri = 'ipfs://QmXxxx';
  const mockTxHash = '0x1234567890abcdef';
  const mockMintAddress = 'CAYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftMintService,
        {
          provide: PrismaService,
          useValue: {
            clip: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: StellarService,
          useValue: {
            validateAddress: jest.fn().mockReturnValue({ valid: true }),
            networkPassphrase: 'Test SDF Network ; September 2015',
            network: 'testnet',
            rpcUrl: 'https://soroban-testnet.stellar.org',
          },
        },
      ],
    }).compile();

    service = module.get<NftMintService>(NftMintService);
    prisma = module.get<PrismaService>(PrismaService);
    stellarService = module.get<StellarService>(StellarService);

    (StellarSdk.Address as any) = {
      fromString: jest.fn().mockReturnValue({
        toScVal: jest.fn().mockReturnValue('address_scval'),
      }),
    };
    (StellarSdk.nativeToScVal as any) = jest
      .fn()
      .mockReturnValue('native_scval');
    (StellarSdk.TimeoutInfinite as any) = 0;
  });

  describe('prepareMintTx', () => {
    it('should throw BadRequestException for empty wallet address', async () => {
      await expect(service.prepareMintTx(mockClipId, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid wallet address', async () => {
      (stellarService.validateAddress as jest.Mock).mockReturnValue({
        valid: false,
        message: 'Invalid format',
      });

      await expect(
        service.prepareMintTx(mockClipId, 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if clip not found', async () => {
      (prisma.clip.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.prepareMintTx(mockClipId, mockWalletAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if clip already minted', async () => {
      (prisma.clip.findUnique as jest.Mock).mockResolvedValue({
        id: mockClipId,
        clipUrl: 'https://example.com/clip.mp4',
        metadataUri: mockMetadataUri,
        mintAddress: mockMintAddress, // Already minted
        video: { userId: 1 },
      });

      await expect(
        service.prepareMintTx(mockClipId, mockWalletAddress),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if clip missing clipUrl', async () => {
      (prisma.clip.findUnique as jest.Mock).mockResolvedValue({
        id: mockClipId,
        clipUrl: null, // Missing
        metadataUri: mockMetadataUri,
        mintAddress: null,
        video: { userId: 1 },
      });

      await expect(
        service.prepareMintTx(mockClipId, mockWalletAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if clip missing metadataUri', async () => {
      (prisma.clip.findUnique as jest.Mock).mockResolvedValue({
        id: mockClipId,
        clipUrl: 'https://example.com/clip.mp4',
        metadataUri: null, // Missing
        mintAddress: null,
        video: { userId: 1 },
      });

      await expect(
        service.prepareMintTx(mockClipId, mockWalletAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid royaltyBps', async () => {
      (prisma.clip.findUnique as jest.Mock).mockResolvedValue({
        id: mockClipId,
        clipUrl: 'https://example.com/clip.mp4',
        metadataUri: mockMetadataUri,
        royaltyBps: 2000, // Invalid: > 1500
        mintAddress: null,
        video: { userId: 1 },
      });

      await expect(
        service.prepareMintTx(mockClipId, mockWalletAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prepare transaction successfully with valid inputs', async () => {
      const mockClip = {
        id: mockClipId,
        clipUrl: 'https://example.com/clip.mp4',
        metadataUri: mockMetadataUri,
        royaltyBps: 1000,
        mintAddress: null,
        video: { userId: 1 },
      };

      (prisma.clip.findUnique as jest.Mock).mockResolvedValue(mockClip);

      // Mock Stellar SDK
      const mockSourceAccount = { getSequenceNumber: () => '123' };
      const mockServer = {
        getAccount: jest.fn().mockResolvedValue(mockSourceAccount),
      };

      (StellarSdk.rpc.Server as jest.Mock).mockImplementation(
        () => mockServer,
      );

      const mockContract = {
        call: jest.fn().mockReturnValue({ toXDR: () => 'operation_xdr' }),
      };

      (StellarSdk.Contract as jest.Mock).mockImplementation(
        () => mockContract,
      );

      const mockTx = {
        toXDR: jest.fn().mockReturnValue('base64_xdr_string'),
      };

      (StellarSdk.TransactionBuilder as jest.Mock).mockImplementation(() => ({
        addOperation: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue(mockTx),
      }));

      const result = await service.prepareMintTx(
        mockClipId,
        mockWalletAddress,
      );

      expect(result).toHaveProperty('xdr');
      expect(result).toHaveProperty('clipId', mockClipId);
      expect(result).toHaveProperty('tokenId', mockClipId);
      expect(result).toHaveProperty('metadataUri', mockMetadataUri);
      expect(result).toHaveProperty('to', mockWalletAddress);
      expect(result.xdr).toBeTruthy();
    });

    it('should use default royaltyBps of 1000 if not provided', async () => {
      const mockClip = {
        id: mockClipId,
        clipUrl: 'https://example.com/clip.mp4',
        metadataUri: mockMetadataUri,
        royaltyBps: null, // Not set
        mintAddress: null,
        video: { userId: 1 },
      };

      (prisma.clip.findUnique as jest.Mock).mockResolvedValue(mockClip);

      const mockSourceAccount = { getSequenceNumber: () => '123' };
      const mockServer = {
        getAccount: jest.fn().mockResolvedValue(mockSourceAccount),
      };

      (StellarSdk.rpc.Server as jest.Mock).mockImplementation(
        () => mockServer,
      );

      const mockContract = {
        call: jest.fn().mockReturnValue({ toXDR: () => 'operation_xdr' }),
      };

      (StellarSdk.Contract as jest.Mock).mockImplementation(
        () => mockContract,
      );

      const mockTx = {
        toXDR: jest.fn().mockReturnValue('base64_xdr_string'),
      };

      (StellarSdk.TransactionBuilder as jest.Mock).mockImplementation(() => ({
        addOperation: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue(mockTx),
      }));

      const result = await service.prepareMintTx(
        mockClipId,
        mockWalletAddress,
      );

      expect(result.xdr).toBeTruthy();
    });
  });

  describe('recordMint', () => {
    it('should update clip with mint address', async () => {
      (prisma.clip.update as jest.Mock).mockResolvedValue({
        id: mockClipId,
        mintAddress: mockMintAddress,
      });

      await service.recordMint(mockClipId, mockTxHash, mockMintAddress);

      expect(prisma.clip.update).toHaveBeenCalledWith({
        where: { id: mockClipId },
        data: {
          mintAddress: mockMintAddress,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle errors during update', async () => {
      (prisma.clip.update as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.recordMint(mockClipId, mockTxHash, mockMintAddress),
      ).rejects.toThrow();
    });
  });
});
