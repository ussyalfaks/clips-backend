import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { NftRoyaltyService } from './nft-royalty.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from 'stellar-sdk';
import Redis from 'ioredis';

jest.mock('ioredis');
jest.mock('@stellar/stellar-sdk');

describe('NftRoyaltyService', () => {
  let service: NftRoyaltyService;
  let stellarService: StellarService;
  let mockedRedis: jest.Mocked<Redis>;

  const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
  const mockTokenId = '42';
  const mockRecipientAddress = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  beforeEach(async () => {
    // Mock Redis
    mockedRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(
      () => mockedRedis,
    );

    // Mock Stellar service
    const mockStellarService = {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftRoyaltyService,
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
      ],
    }).compile();

    service = module.get<NftRoyaltyService>(NftRoyaltyService);
    stellarService = module.get<StellarService>(StellarService);

    // Set the CONTRACT_ID
    (service as any).CONTRACT_ID = mockContractId;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queryRoyalty', () => {
    it('should return cached data if available', async () => {
      const mockRoyaltyData = { royaltyBps: 1000, recipient: mockRecipientAddress };
      mockedRedis.get.mockResolvedValue(JSON.stringify(mockRoyaltyData));

      const result = await service.queryRoyalty(mockTokenId);

      expect(result).toEqual(mockRoyaltyData);
      expect(mockedRedis.get).toHaveBeenCalledWith(`royalty:${mockTokenId}`);
    });

    it('should throw BadRequestException for empty token ID', async () => {
      await expect(service.queryRoyalty('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if CONTRACT_ID not configured', async () => {
      (service as any).CONTRACT_ID = undefined;
      mockedRedis.get.mockResolvedValue(null);

      await expect(service.queryRoyalty(mockTokenId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should query contract and cache result on cache miss', async () => {
      mockedRedis.get.mockResolvedValue(null);
      mockedRedis.setex.mockResolvedValue('OK');

      // Mock the contract call
      const mockRoyaltyData = { royaltyBps: 1000, recipient: mockRecipientAddress };
      jest
        .spyOn(service as any, 'fetchRoyaltyFromContract')
        .mockResolvedValue(mockRoyaltyData);

      const result = await service.queryRoyalty(mockTokenId);

      expect(result).toEqual(mockRoyaltyData);
      expect(mockedRedis.setex).toHaveBeenCalledWith(
        `royalty:${mockTokenId}`,
        300,
        JSON.stringify(mockRoyaltyData),
      );
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache entry for token', async () => {
      mockedRedis.del.mockResolvedValue(1);

      await service.invalidateCache(mockTokenId);

      expect(mockedRedis.del).toHaveBeenCalledWith(`royalty:${mockTokenId}`);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis connection', async () => {
      mockedRedis.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockedRedis.quit).toHaveBeenCalled();
    });
  });
});
