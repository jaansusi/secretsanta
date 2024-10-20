export class ReadUserDto {
    readonly id: number;
    readonly name: string;
    readonly email: string;
    readonly encryptionStrategy: string;
    readonly familyId: number;
    readonly isAdmin: boolean;
}