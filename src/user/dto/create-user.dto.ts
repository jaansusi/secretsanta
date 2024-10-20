export class CreateUserDto {
    id: number;
    name: string;
    email: string;
    idCode: string;
    encryptionStrategy: string;
    familyId: number;
    isAdmin: boolean;
}