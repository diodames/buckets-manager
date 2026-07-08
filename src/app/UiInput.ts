import { BT } from 'blit386';
import { displayConfig } from '../config/display';

// One immutable input snapshot per engine tick. The engine's edge detection
// (isPressed/isKeyPressed) is only valid inside update(), so ManagerGame
// builds this frame once and screens/widgets consume plain booleans.
export interface UiInputFrame {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    confirm: boolean;
    cancel: boolean;
    /** Toggle dashboard inbox focus. */
    inbox: boolean;
    pointer: { x: number; y: number } | null;
    click: boolean;
}

export function buildInputFrame(): UiInputFrame {
    const repeat = displayConfig.keyRepeatTicks;
    const pointerValid = BT.pointerPosValid(0);
    const pos = pointerValid ? BT.pointerPos(0) : null;
    // Arrows are checked both as abstract buttons (gamepad + WASD mapping)
    // and as raw keys: the key-event path also catches taps shorter than one
    // engine tick that the sampled button state misses.
    return {
        up: BT.isPressed(BT.BTN_UP, BT.PLAYER_ONE, repeat) || BT.isKeyPressed('ArrowUp', repeat),
        down: BT.isPressed(BT.BTN_DOWN, BT.PLAYER_ONE, repeat) || BT.isKeyPressed('ArrowDown', repeat),
        left: BT.isPressed(BT.BTN_LEFT, BT.PLAYER_ONE, repeat) || BT.isKeyPressed('ArrowLeft', repeat),
        right: BT.isPressed(BT.BTN_RIGHT, BT.PLAYER_ONE, repeat) || BT.isKeyPressed('ArrowRight', repeat),
        confirm: BT.isKeyPressed('Enter') || BT.isKeyPressed('NumpadEnter') || BT.isPressed(BT.BTN_A, BT.PLAYER_ONE),
        cancel: BT.isKeyPressed('Escape') || BT.isPressed(BT.BTN_B, BT.PLAYER_ONE),
        inbox: BT.isKeyPressed('KeyI'),
        pointer: pos ? { x: pos.x, y: pos.y } : null,
        click: BT.isPressed(BT.BTN_POINTER_A, BT.PLAYER_ONE),
    };
}
