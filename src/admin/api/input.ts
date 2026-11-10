import { BadRequestException } from '@nestjs/common';

/** Small hand-rolled validators for admin API bodies (the project has no class-validator). */
export function readString(body: any, key: string, options: { required?: boolean; max?: number } = {}): string | undefined {
    const value = body?.[key];
    if (value === undefined) {
        if (options.required) throw new BadRequestException(`${key} is required`);
        return undefined;
    }
    if (value === null) {
        return '';
    }
    if (typeof value !== 'string') {
        throw new BadRequestException(`${key} must be text`);
    }
    const text = value.trim();
    if (options.required && !text) {
        throw new BadRequestException(`${key} is required`);
    }
    if (options.max && text.length > options.max) {
        throw new BadRequestException(`${key} must be at most ${options.max} characters`);
    }
    return text;
}

export function readOptionalId(body: any, key: string): number | null | undefined {
    const value = body?.[key];
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const id = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestException(`${key} must be an id`);
    }
    return id;
}

export function readBoolean(body: any, key: string): boolean | undefined {
    const value = body?.[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
        throw new BadRequestException(`${key} must be true or false`);
    }
    return value;
}

export function readIdList(body: any, key: string): number[] {
    const value = body?.[key];
    if (!Array.isArray(value) || value.some(item => !Number.isInteger(item) || item <= 0)) {
        throw new BadRequestException(`${key} must be a list of ids`);
    }
    return [...new Set<number>(value)];
}

export function readPaging(query: any, defaultLimit = 50) {
    const limit = Math.min(Math.max(parseInt(query?.limit, 10) || defaultLimit, 1), 500);
    const offset = Math.max(parseInt(query?.offset, 10) || 0, 0);
    return { limit, offset };
}
