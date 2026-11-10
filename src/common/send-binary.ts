import { Request, Response } from 'express';

/**
 * Sends a buffer with HTTP range support. iOS Safari only plays audio from servers that answer
 * range requests with 206 Partial Content.
 */
export function sendBinary(request: Request, response: Response, data: Buffer, mimeType: string, cacheControl: string) {
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', cacheControl);
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    if (match && (match[1] || match[2])) {
        let start: number;
        let end: number;
        if (match[1]) {
            start = parseInt(match[1], 10);
            end = match[2] ? Math.min(parseInt(match[2], 10), data.length - 1) : data.length - 1;
        } else {
            // "bytes=-500": the last 500 bytes.
            start = Math.max(data.length - parseInt(match[2], 10), 0);
            end = data.length - 1;
        }
        if (start > end || start >= data.length) {
            response.status(416).setHeader('Content-Range', `bytes */${data.length}`);
            response.end();
            return;
        }
        response.status(206);
        response.setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`);
        response.setHeader('Content-Length', String(end - start + 1));
        response.end(data.subarray(start, end + 1));
        return;
    }
    response.setHeader('Content-Length', String(data.length));
    response.end(data);
}
