import { BT, Vector2i } from 'blit386';
import { ROLE } from './theme';

/**
 * Minimal dependency-free error rendering used when init fails before the
 * text grid or screens exist. Draws with raw engine calls only.
 */
export function drawChromeErrorFallback(error: Error): void {
    BT.systemPrint(new Vector2i(8, 8), ROLE.danger, 'STARTUP ERROR');
    const message = error.message;
    const maxChars = 70;
    for (let i = 0; i * maxChars < message.length && i < 20; i++) {
        BT.systemPrint(new Vector2i(8, 28 + i * 14), ROLE.text, message.slice(i * maxChars, (i + 1) * maxChars));
    }
}
