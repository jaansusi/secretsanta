import { AdminAccessService } from './admin-access.service';
import { ADMIN_COOKIE, ADMIN_GROUP_COOKIE } from './admin-session';

/** Who manages which group: the super admin everything, anyone else only groups where they are marked admin. */
describe('AdminAccessService', () => {
    const groups = [
        { id: 1, name: 'Family' },
        { id: 2, name: 'Work' },
        { id: 3, name: 'Friends' },
    ];
    const users = [
        { id: 10, groupId: 1, name: 'Mari', email: 'mari@example.com', isAdmin: true },
        { id: 11, groupId: 2, name: 'Mari', email: 'mari@example.com', isAdmin: false },
        { id: 12, groupId: 3, name: 'Mari T', email: 'mari@example.com', isAdmin: true },
        { id: 20, groupId: 2, name: 'Boss', email: 'boss@example.com', isAdmin: true },
        { id: 30, groupId: 1, name: 'Org', email: 'org@example.com', isAdmin: false },
    ];
    // The service filters users with where(lower(email), value): the value is on `logic`.
    const userRepository = { findAll: async ({ where }: any) => users.filter(user => user.email === where.logic) };
    const groupRepository = {
        findAll: async ({ where }: any = {}) => groups.filter(group => !where || where.id.includes(group.id)),
    };
    const service = new AdminAccessService(userRepository as any, groupRepository as any);

    function request(email: string | null, selectedGroup?: number) {
        const signedCookies: Record<string, string> = {};
        if (email) signedCookies[ADMIN_COOKIE] = `${Date.now() + 60_000}.${Buffer.from(email).toString('base64url')}`;
        if (selectedGroup) signedCookies[ADMIN_GROUP_COOKIE] = String(selectedGroup);
        return { signedCookies } as any;
    }

    beforeEach(() => { process.env.ADMIN_EMAIL = 'Org@Example.com'; });

    it('gives a group admin exactly the groups where they are marked admin', async () => {
        const context = await service.resolve(request('mari@example.com'));
        expect(context!.isSuperAdmin).toBe(false);
        expect(context!.groups.map(group => group.id).sort()).toEqual([1, 3]);
        expect(context!.actor.id).toBe(context!.group.id === 1 ? 10 : 12);
    });

    it('honours the chosen group, but never one the admin may not manage', async () => {
        expect((await service.resolve(request('mari@example.com', 3)))!.group.id).toBe(3);
        expect((await service.resolve(request('mari@example.com', 3)))!.actor.id).toBe(12);
        // Mari is a participant in Work but not its admin: choosing it falls back to a group she manages.
        expect((await service.resolve(request('mari@example.com', 2)))!.group.id).not.toBe(2);
        expect(await service.canManageGroup(request('mari@example.com'), 2)).toBe(false);
        expect(await service.canManageGroup(request('boss@example.com'), 1)).toBe(false);
    });

    it('lets the super admin (ADMIN_EMAIL, case-insensitive) manage every group', async () => {
        const context = await service.resolve(request('org@example.com', 2));
        expect(context!.isSuperAdmin).toBe(true);
        expect(context!.groups).toHaveLength(3);
        expect(context!.group.id).toBe(2);
        // Not a participant of Work: the audit log names their row in another group.
        expect(context!.actor.id).toBe(30);
    });

    it('denies people who are admin nowhere, and requests without an admin cookie', async () => {
        expect(await service.resolve(request('nobody@example.com'))).toBeNull();
        expect(await service.resolve(request(null))).toBeNull();
        delete process.env.ADMIN_EMAIL;
        expect(await service.resolve(request('org@example.com'))).toBeNull();
    });
});
