import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/** Body of POST /family (create or rename a family). Unknown fields are rejected. */
export class CreateFamilyDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    id?: number | null;

    @IsString()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @Length(1, 100)
    name: string;
}
