import { Body, Controller, forwardRef, Get, Inject, Post, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { FamilyService } from './family.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { ReadFamilyDto } from './dto/read-family.dto';

@Controller('admin')
export class FamilyController {
    constructor(
        private readonly familyService: FamilyService,
    ) { }

    @Get('families')
    @Render('families')
    async displayFamiliesPage(@Req() request: Request): Promise<any> {
        if (request.cookies['santa_auth']) {
            // to-do: check user credentials without creating a circular dependency between user and family
            const id = request.cookies['santa_auth'];
            const families = await this.familyService.findAll({ include: ['members'] });
            let familiesDto: ReadFamilyDto[] = [];
            for (let family of families) {
                familiesDto.push({ id: family.id, name: family.name, members: family.members.map(function(x) { return {...x, familyId: x.family?.id}}), size: family.members.length });
            }
            // This is not a valid way of determining isAdmin, user can have no family
            // if (families.map(x => x.members).flat().some(x => x.id === id && x.isAdmin)) 
            return { families: familiesDto, isAdmin: true };
        }
        return {};
    }

    @Get('family')
    async getFamilies() {
        return this.familyService.findAll();
    }

    @Post('family')
    async createFamily(@Body() familyDto: CreateFamilyDto) {
        return this.familyService.createFamily(familyDto);
    }
}
