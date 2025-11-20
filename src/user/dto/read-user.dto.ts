import { ReadFamilyDto } from "src/family/dto/read-family.dto";
import { User } from "../entities/user.entity";

export class ReadUserDto {
    constructor(user: User) {
        this.id = user.id;
        this.name = user.name;
        this.email = user.email;
        this.idCode = user.idCode;
        this.encryptionStrategy = user.encryptionStrategy;
        this.communicationStrategy = user.communicationStrategy;
        this.phoneNumber = user.phoneNumber;
        this.familyId = user.familyId;
        this.family = user.family ? new ReadFamilyDto(user.family) : undefined;
        this.isAdmin = user.isAdmin;
        this.lastYearGiftingToId = user.lastYearGiftingToId;
        this.interestingFacts = user.interestingFacts;
    }
    
    readonly id: number;
    readonly name: string;
    readonly email: string;
    readonly idCode: string;
    readonly encryptionStrategy: string;
    readonly communicationStrategy: string;
    readonly phoneNumber: string;
    readonly familyId: number;
    readonly family?: ReadFamilyDto;
    readonly isAdmin: boolean;
    readonly lastYearGiftingToId: number;
    readonly interestingFacts: string;
    lastYearGiftingToName?: string;
}