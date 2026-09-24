export const DEFAULT_TIME_CONTROL = Object.freeze({ base: 300, increment: 0 });

export const TIME_PRESETS = Object.freeze(
    [
        { label: '1+0', category: 'Bullet', base: 60, increment: 0 },
        { label: '2+1', category: 'Bullet', base: 120, increment: 1 },
        { label: '3+0', category: 'Blitz', base: 180, increment: 0 },
        { label: '3+2', category: 'Blitz', base: 180, increment: 2 },
        { label: '5+0', category: 'Blitz', base: 300, increment: 0 },
        { label: '5+3', category: 'Blitz', base: 300, increment: 3 },
        { label: '10+0', category: 'Rapid', base: 600, increment: 0 },
        { label: '10+5', category: 'Rapid', base: 600, increment: 5 },
        { label: '15+10', category: 'Rapid', base: 900, increment: 10 },
        { label: '30+0', category: 'Classical', base: 1800, increment: 0 },
        { label: '30+20', category: 'Classical', base: 1800, increment: 20 },
    ].map(Object.freeze),
);

export const isValidTimeControl = (control) =>
    control !== null &&
    typeof control === 'object' &&
    Number.isInteger(control.base) &&
    control.base > 0 &&
    control.base <= 180 * 60 &&
    Number.isInteger(control.increment) &&
    control.increment >= 0 &&
    control.increment <= 180;

export const customTimeControl = (minutes, increment) => {
    if (
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 180 ||
        !Number.isInteger(increment)
    ) {
        return null;
    }
    const control = { base: minutes * 60, increment };
    return isValidTimeControl(control) ? control : null;
};
