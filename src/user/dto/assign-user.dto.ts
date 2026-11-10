/** Internal: the encrypted assignment written to a user after the draw. Never accepted from requests. */
export class AssignUserDto {
    iv: string;
    giftingTo: string;
    decryptionCode: string;
    giftingToDebug?: string;
}
