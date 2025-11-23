import { User } from "../entities/user.entity";

export class CreateUserDto {
    constructor(partial?: Partial<User>) {
        Object.assign(this, partial);
    }
    id: number;
    name: string;
    email: string;
    idCode: string;
    encryptionStrategy: string;
    familyId: number;
    isAdmin: boolean;
    lastYearGiftingToId: number;
    interestingFacts: string;
}