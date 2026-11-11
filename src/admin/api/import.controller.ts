import { BadRequestException, Controller, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { ImportService } from '../import/import.service';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

@Controller('api/admin/import')
@UseGuards(AdminGuard)
export class ImportController {
    constructor(private readonly importService: ImportService) { }

    /** Upload a data file (see import-file.ts). `?dryRun=true` only reports what the import would do. */
    @Post()
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 0, parts: 1 } }))
    run(
        @CurrentAdmin() admin: User,
        @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
        @Query('dryRun') dryRun: string | undefined,
    ) {
        if (!file || !file.buffer || file.size === 0) {
            throw new BadRequestException('No file uploaded');
        }
        return this.importService.run(admin, file.buffer, dryRun === 'true');
    }
}
