import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class TwilioService {
    private twilioClient: twilio.Twilio;

    constructor(
        private configService: ConfigService,
        private readonly logger: Logger,
    ) {
        const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        
        if (accountSid && authToken) {
            this.twilioClient = twilio(accountSid, authToken);
            this.logger.log('Twilio client initialized successfully');
        } else {
            this.logger.warn('Twilio credentials not found in environment variables');
        }
    }

    async sendSMS(to: string, message: string): Promise<boolean> {
        try {
            const fromId = this.configService.get<string>('TWILIO_SENDER_ID');
            
            if (!this.twilioClient) {
                this.logger.error('Twilio client not initialized');
                return false;
            }

            if (!fromId) {
                this.logger.error('Twilio sender ID not configured');
                return false;
            }

            const result = await this.twilioClient.messages.create({
                body: message,
                from: fromId,
                to: to,
            });

            this.logger.log(`SMS sent successfully to ${to}, SID: ${result.sid}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
            return false;
        }
    }

    async sendBulkSMS(recipients: { phoneNumber: string; message: string }[]): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const recipient of recipients) {
            const result = await this.sendSMS(recipient.phoneNumber, recipient.message);
            if (result) {
                success++;
            } else {
                failed++;
            }
        }

        this.logger.log(`Bulk SMS sent: ${success} succeeded, ${failed} failed`);
        return { success, failed };
    }
}
