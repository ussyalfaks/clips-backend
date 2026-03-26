import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class BulkDeleteClipsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  clipIds: number[];
}
