import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { UserPlatformService } from './user-platform.service';

@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [UserPlatformService],
  exports: [UserPlatformService],
})
export class UserPlatformModule {}
