import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/user/entities/user.entity';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { UserService } from 'src/user/user.service';
import { FamilyService } from 'src/family/family.service';
import { Family } from 'src/family/entities/family.entity';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
    private shuffledParticipants: User[] = [];

    constructor(
        private userService: UserService,
        private familyService: FamilyService,
        private encriptionService: EncryptionService,
        private readonly logger: Logger
    ) { }

    public async assignSantas(): Promise<boolean> {
        await this.userService.cleanGiftingToForAll();
        const participants = await this.userService.findAll({ include: [{ model: Family }] });
        
        this.shuffledParticipants = this.unbiasedShuffle(participants);
        // Create deep copy of shuffled participants to avoid modifying the original list.
        const generatedPath = await this.generateGraphPath(JSON.parse(JSON.stringify(this.shuffledParticipants)), 1);
        if (generatedPath.length !== this.shuffledParticipants.length) {
            return false;
        }
        for (let i = 0; i < generatedPath.length; i++) {
            const nextIndex = i === generatedPath.length - 1 ? 0 : i + 1;
            try {

                let user = generatedPath[i];
                let giftingTo = generatedPath[nextIndex].name;
                let assignUserDto = await this.encriptionService.encryptGiftingTo(user, giftingTo);
                if (process.env.NODE_ENV === 'development') {
                    assignUserDto.giftingToDebug = giftingTo;
                }
                await this.userService.updateUser(user.id, assignUserDto);
            } catch (e) {
                this.logger.error(e);
            }
        }
        return true;
    }

    private async generateGraphPath(remainingNodes: User[], depth: number): Promise<User[]> {
        const currentNode = remainingNodes.shift();
        if (!currentNode) {
            return [];
        }
        const forbiddenPathsFromThisNode = await this.generateAllForbiddenPaths(currentNode, remainingNodes);
        const possiblePathsFromThisNode = remainingNodes.filter(x => !forbiddenPathsFromThisNode.map(y => y.id).includes(x.id));
        if (remainingNodes.length === 0) {
            // Reached the last node on the list, validate that it has a path to the first.
            let firstNode = this.shuffledParticipants[0];
            return !forbiddenPathsFromThisNode.map(y => y.id).includes(firstNode.id) ? [currentNode] : [];
        }
        for (let node of possiblePathsFromThisNode) {
            // Move the node to the front of the list.
            let recursiveNodes = remainingNodes.filter(x => x !== node);
            recursiveNodes.unshift(node);
            const path = await this.generateGraphPath(recursiveNodes, depth + 1);
            if (path.length === remainingNodes.length) {
                return [currentNode, ...path];
            }
        }
        return [];
    }

    private async generateAllForbiddenPaths(node: User, remainingNodes: User[]): Promise<User[]> {
        let forbiddenPaths: User[] = [];
        if (node.family) {
            let family = await this.familyService.findOne({ where: { id: node.family.id }, include: [{ model: User }] });
            forbiddenPaths = family.members;
        }
        if (node.lastYearGiftingToId) {
            let lastYearGiftingTo = await this.userService.findOne({ where: { id: node.lastYearGiftingToId } });
            forbiddenPaths.push(lastYearGiftingTo);
        }
        return forbiddenPaths;
    }

    private unbiasedShuffle(array: User[]): User[] {
        let currentIndex = array.length, randomIndex;

        // While there remain elements to shuffle.
        while (currentIndex > 0) {

            // Pick a remaining element.
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    public async validateSantas(): Promise<any> {
        const users = await this.userService.findAll({ include: [{ model: Family }] });
        let names = users.map(x => x.name).sort();
        let designatedSantas = users.map(x => this.encriptionService.decryptGiftingTo(x)).sort();
        let allPeopleHaveSomeoneToGiftTo = true;
        for (let user of users) {
            if (!user.giftingTo && (user.encryptionStrategy !== EncryptionStrategy.CDOC)) {
                allPeopleHaveSomeoneToGiftTo = false
            }
        }
        const allPeopleGiftToAUniquePerson = new Set(designatedSantas).size === users.length;
        let allPeopleGiftToSomeoneNotInTheirFamily = true;
        for (let user of users) {
            if (user.family) {
                let family = await this.familyService.findOne({ where: { id: user.family.id }, include: [{ model: User }] });
                let userFamilyNames = family.members.map(x => x.name);
                if (userFamilyNames && userFamilyNames.includes(this.encriptionService.decryptGiftingTo(user))) {
                    allPeopleGiftToSomeoneNotInTheirFamily = false;
                    break;
                }
            }
        }
        let allPeopleGiftToSomeoneNew = true;
        for (let user of users) {
            if (user.lastYearGiftingToId) {
                let lastYearGiftingTo = await this.userService.findOne({ where: { id: user.lastYearGiftingToId } });
                if (this.encriptionService.decryptGiftingTo(user) === lastYearGiftingTo.name) {
                    allPeopleGiftToSomeoneNew = false;
                    break;
                }
            }
        }
        const secretNameArray = users.map(x => x.name);
        let response = {
            noErrorsDuringValidation: true,
            namesAndSantasMatch: JSON.stringify(names) === JSON.stringify(designatedSantas),
            allPeopleHaveSomeoneToGiftTo: allPeopleHaveSomeoneToGiftTo,
            allPeopleGiftToAUniquePerson: allPeopleGiftToAUniquePerson,
            allPeopleGiftToSomeoneNotInTheirFamily: allPeopleGiftToSomeoneNotInTheirFamily,
            allPeopleGiftToSomeoneNew: allPeopleGiftToSomeoneNew,
            usersIdsAndTheirDesignatedSantas: users.map(x => (secretNameArray.indexOf(x.name).toString() + '-' + secretNameArray.indexOf(x.giftingTo).toString())),
            names: names,
            designatedSantas: designatedSantas,
        };
        return response;
    }

    public async generateDbHash(): Promise<string> {
        // Get all user data and hash it to prevent tampering
        let hashData = (await this.userService.findAll({ order: [['id', 'ASC']], include: [{ model: Family }] })).map(x => x.id + x.name + x.giftingTo + x.encryptionStrategy + x.email + x.family?.id).join();
        let dbHash = crypto.createHash("shake256", { outputLength: 4 }).update(hashData).digest('hex');
        return dbHash;
    }

    public async generateUserMessages(): Promise<any[]> {
        const users = await this.userService.findAll({ order: [['name', 'ASC']], include: [{ model: Family }] });
        const baseUrl = process.env.HOST || 'http://localhost:3000';
        
        return users.map(user => {
            const link = user.decryptionCode 
                ? `${baseUrl}/?kood=${encodeURIComponent(user.decryptionCode)}`
                : `${baseUrl}/`;
            
            const message = user.decryptionCode
                ? `Tere ${user.name}! Selle aasta jõululoosi saad kätte siit: ${link}` : 
                '';
            
            return {
                name: user.name,
                email: user.email,
                link: link,
                message: message,
                hasCode: !!user.decryptionCode,
                encryptionStrategy: user.encryptionStrategy
            };
        });
    }
}