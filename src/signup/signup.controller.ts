import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { CODE_CHECK_THROTTLE, SIGNUP_THROTTLE } from 'src/security/throttle';
import { SignupFormValues } from './signup-input';
import { SIGNUP_PATH, SignupService, SignupState } from './signup.service';

const CLOSED_MESSAGES: Record<Exclude<SignupState, 'open'>, string> = {
    closed: 'Registreerumine on praegu suletud. Küsi korraldajalt.',
    drawn: 'Loos on juba tehtud, nii et uusi osalejaid enam lisada ei saa. Kui soovid siiski osaleda, võta ühendust korraldajaga.',
};

/**
 * The public sign-up page behind a group's sign-up link. It only adds a participant: it signs nobody in and shows
 * nothing about the group except its name and family names. Personal links come from the draw, as for everyone.
 */
@Controller(SIGNUP_PATH.slice(1))
export class SignupController {
    constructor(
        private readonly signupService: SignupService,
        private readonly analyticsService: AnalyticsService,
    ) { }

    @Get(':code')
    @Throttle(CODE_CHECK_THROTTLE)
    async form(
        @Req() request: Request, @Res() response: Response, @Param('code') code: string,
        @Query('valmis') done?: string, @Query('perekond') family?: string,
    ) {
        const found = await this.signupService.findByCode(code);
        if (!found) {
            return response.status(404).render('signup', { invalid: true });
        }
        const { group, state } = found;
        // "Add someone else" keeps the family of the person who just signed up, for signing up a whole family.
        const familyId = typeof family === 'string' && /^\d{1,10}$/.test(family) ? family : '';
        // After a successful sign-up (post/redirect/get), so reloading the page does not post the form again.
        if (done !== undefined) {
            const again = `${SIGNUP_PATH}/${encodeURIComponent(code)}` + (familyId ? `?perekond=${familyId}` : '');
            return response.render('signup', { signupGroup: group.name, done: true, again });
        }
        await this.analyticsService.track('signup_view', request, { groupId: group.id });
        if (state !== 'open') {
            return response.render('signup', { signupGroup: group.name, closed: CLOSED_MESSAGES[state] });
        }
        return this.renderForm(response, code, group.id, group.name, { name: '', email: '', family: familyId, newFamily: '' });
    }

    @Post(':code')
    @Throttle(SIGNUP_THROTTLE)
    async submit(@Req() request: Request, @Res() response: Response, @Param('code') code: string, @Body() body: any) {
        const found = await this.signupService.findByCode(code);
        if (!found) {
            return response.status(404).render('signup', { invalid: true });
        }
        const { group, state } = found;
        if (state !== 'open') {
            return response.status(409).render('signup', { signupGroup: group.name, closed: CLOSED_MESSAGES[state] });
        }
        const outcome = await this.signupService.register(group.id, body);
        if (!outcome.ok) {
            return this.renderForm(response.status(400), code, group.id, group.name, outcome.values, outcome.error);
        }
        await this.analyticsService.track('signup', request, { userId: outcome.user.id });
        const familyId = outcome.user.familyId ? `&perekond=${outcome.user.familyId}` : '';
        return response.redirect(303, `${SIGNUP_PATH}/${encodeURIComponent(code)}?valmis${familyId}`);
    }

    private async renderForm(response: Response, code: string, groupId: number, groupName: string, values?: SignupFormValues, error?: string) {
        const { families, allowNewFamilies } = await this.signupService.formOptions(groupId);
        const family = values?.family ?? '';
        return response.render('signup', {
            signupGroup: groupName,
            action: `${SIGNUP_PATH}/${code}`,
            error,
            values: values ?? { name: '', email: '', family: '', newFamily: '' },
            families: families.map(item => ({ ...item, selected: String(item.id) === family })),
            hasFamilies: families.length > 0,
            allowNewFamilies,
            noneSelected: family === '',
            newSelected: family === 'new' && allowNewFamilies,
        });
    }
}
