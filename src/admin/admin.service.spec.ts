import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { FamilyService } from '../family/family.service';
import { UserService } from '../user/user.service';

describe('AdminService', () => {
    let adminService: AdminService;
    let userService: UserService;
    let familyService: FamilyService;
    const cycleCount: number = 1000;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            providers: [AdminService],
        }).compile();

        adminService = app.get<AdminService>(AdminService);
        userService = app.get<UserService>(UserService);
        familyService = app.get<FamilyService>(FamilyService);
    });

    describe('validate the santa list', () => {
        it('santas should have all participants', async () => {
            for (let i = 0; i < cycleCount; i++) {
                await adminService.assignSantas();
                const users = await userService.findAll();
                const families = await familyService.findAll();
                for (let family of families) {
                    for (let member of family.members) {
                        expect(users.map(x => x.name).includes(member.name)).toBe(true);
                    }
                }
            }
        });

        it('no blocked connections', async () => {
            // Generate blocklist for each person in the list.
            const blocklist: Record<string, string[]> = {};

            const families = await familyService.findAll();
            for (let family of families) {
                for (let member of family.members) {
                    blocklist[member.name] = family.members.map(x => x.name).filter(x => x !== member.name);
                }
            }
            for (let i = 0; i < cycleCount; i++) {
                await adminService.assignSantas();
                let users = (await userService.findAll()).map(x => x.name);
                for (let j = 0; j < users.length; j++) {
                    const prevIndex = j === 0 ? users.length - 1 : j - 1;
                    const nextIndex = j === users.length - 1 ? 0 : j + 1;
                    expect(blocklist[users[j]].includes(users[prevIndex])).toBe(false);
                    expect(blocklist[users[j]].includes(users[nextIndex])).toBe(false);
                }
            }
        });

    });
});
