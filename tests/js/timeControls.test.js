import assert from 'node:assert/strict';
import test from 'node:test';
import { customTimeControl } from '../../resources/js/config/timeControls.js';

test('custom time accepts whole minutes and increments within the input limits', () => {
    assert.deepEqual(customTimeControl(1, 0), { base: 60, increment: 0 });
    assert.deepEqual(customTimeControl(7, 12), { base: 420, increment: 12 });
    assert.deepEqual(customTimeControl(180, 180), {
        base: 10800,
        increment: 180,
    });
});

test('custom time rejects empty, fractional, and out-of-range input', () => {
    for (const minutes of ['', '5', NaN, Infinity, 0, -1, 1.5, 181]) {
        assert.equal(customTimeControl(minutes, 0), null);
    }
    for (const increment of ['', '3', NaN, Infinity, -1, 0.5, 181]) {
        assert.equal(customTimeControl(5, increment), null);
    }
});
