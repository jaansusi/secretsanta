import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { SignupService } from 'src/signup/signup.service';

/** The current group's sign-up link: open or close it, and replace it. */
@Controller('api/admin/signup')
@UseGuards(AdminGuard)
export class SignupAdminController {
    constructor(private readonly signupService: SignupService) { }

    @Get()
    status(@CurrentGroupId() groupId: number) {
        return this.signupService.adminStatus(groupId);
    }

    @Put()
    update(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        return this.signupService.adminUpdate(admin, groupId, body);
    }

    @Post('new-link')
    @HttpCode(200)
    regenerate(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number) {
        return this.signupService.regenerate(admin, groupId);
    }
}
