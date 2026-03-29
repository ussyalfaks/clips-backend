import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';

describe('NftMintService uploadMetadataToIPFS', () => {
  const prismaMock = {
    clip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const stellarMock = {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    network: 'testnet',
  };

  let service: NftMintService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftMintService(prismaMock as any, stellarMock as any);
  });

  it('throws NotFoundException when clip does not exist', async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);

    await expect(service.uploadMetadataToIPFS(101)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws BadRequestException when clipUrl is missing', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 2,
      clipUrl: '',
    });

    await expect(service.uploadMetadataToIPFS(2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads metadata, persists metadataUri, and returns cid', async () => {
    prismaMock.clip.findUnique.mockResolvedValue({
      id: 5,
      title: 'Amazing Clip',
      caption: 'A test clip',
      clipUrl: 'https://cdn.example.com/video.mp4',
      thumbnail: 'https://cdn.example.com/thumb.jpg',
      duration: 27,
      viralityScore: 88,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      postStatus: { tiktok: true },
    });

    const uploadSpy = jest
      .spyOn(service as any, 'uploadMetadataToIpfs')
      .mockResolvedValue('ipfs://bafyTestCid123');

    prismaMock.clip.update.mockResolvedValue({});

    const result = await service.uploadMetadataToIPFS(5);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const [metadata, clipId] = uploadSpy.mock.calls[0];

    expect(clipId).toBe(5);
    expect(metadata).toMatchObject({
      name: 'Amazing Clip',
      description: 'A test clip',
      image: 'https://cdn.example.com/thumb.jpg',
      animation_url: 'https://cdn.example.com/video.mp4',
    });
    expect(metadata.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trait_type: 'royaltyBps', value: 1000 }),
        expect.objectContaining({ trait_type: 'royaltyPercent', value: 10 }),
      ]),
    );

    expect(prismaMock.clip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { metadataUri: 'ipfs://bafyTestCid123' },
    });

    expect(result).toEqual({
      clipId: 5,
      cid: 'bafyTestCid123',
      metadataUri: 'ipfs://bafyTestCid123',
    });
  });
});
