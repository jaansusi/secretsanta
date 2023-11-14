import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';
import { User } from 'src/user/entities/user.entity';


@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('generate')
    generateSantas(): string[] {
        return this.adminService.generateSantas();
    }
}