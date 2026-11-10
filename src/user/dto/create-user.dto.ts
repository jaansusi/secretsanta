import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { EncryptionStrategy } from 'src/encryption/encryption.service';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

/** Body of POST /user (create or update a participant). Unknown fields are rejected. */
export class CreateUserDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    id?: number | null;

    @IsString()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @Length(1, 100)
    name: string;

    @IsOptional()
    @Transform(emptyToNull)
    @IsEmail()
    @MaxLength(254)
    email?: string | null;

    @IsOptional()
    @IsIn(Object.values(EncryptionStrategy))
    encryptionStrategy?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    familyId?: number | null;

    @IsOptional()
    @IsBoolean()
    isAdmin?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    lastYearGiftingToId?: number | null;

    @IsOptional()
    @IsString()
    @MaxLength(5000)
    interestingFacts?: string | null;
}
