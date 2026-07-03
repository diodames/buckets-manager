// Display and timing configuration. 640x400 gives the system font a text grid
// wide enough for DOS-manager style tables (the exact grid is measured at
// runtime from the engine font metrics).
export const displayConfig = Object.freeze({
    width: 640,
    height: 400,
    maxCanvasWidth: 1280,
    maxCanvasHeight: 800,
    targetFPS: 60,
    // Key-repeat rate for held navigation keys, in engine ticks.
    keyRepeatTicks: 6,
});
