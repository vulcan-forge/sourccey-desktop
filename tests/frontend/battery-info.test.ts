// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { calculateBatteryPercent, getBatteryChargeState, getBatteryTimeEstimate, type BatteryData } from '@/hooks/System/system-info.hook';

const battery = (overrides: Partial<BatteryData> = {}): BatteryData => ({
    voltage: 12.6,
    current_a: -1,
    remaining_capacity_ah: 4,
    max_capacity_ah: 8,
    state_of_charge: 50,
    max_error: 2,
    error: null,
    ...overrides,
});

describe('battery time estimate', () => {
    test('estimates remaining runtime while discharging', () => {
        expect(getBatteryTimeEstimate(battery({ current_a: -2, remaining_capacity_ah: 3 }))).toBe(1.5);
    });

    test('estimates time until full while charging', () => {
        expect(getBatteryTimeEstimate(battery({ current_a: 2, remaining_capacity_ah: 3, max_capacity_ah: 8 }))).toBe(2.5);
    });

    test('does not show an unstable estimate at near-zero current', () => {
        expect(getBatteryTimeEstimate(battery({ current_a: 0.01 }))).toBeNull();
    });

    test('does not estimate from unavailable capacity values', () => {
        expect(getBatteryTimeEstimate(battery({ remaining_capacity_ah: -1 }))).toBeNull();
    });

    test('does not treat unloaded default data as a discharging battery', () => {
        expect(
            getBatteryChargeState(battery({ voltage: -1, current_a: -1, remaining_capacity_ah: -1, max_capacity_ah: -1, state_of_charge: -1 }))
        ).toBe('unknown');
    });
});

describe('battery percentage reliability', () => {
    test('uses voltage when the gauge briefly reports zero for a charged pack', () => {
        expect(calculateBatteryPercent(battery({ voltage: 12.55, state_of_charge: 0, max_error: 0 }))).toBe(50);
    });

    test('allows zero when pack voltage is at the configured empty voltage', () => {
        expect(calculateBatteryPercent(battery({ voltage: 11.5, state_of_charge: 0, max_error: 0 }))).toBe(0);
    });

    test('prefers a valid nonzero gauge reading over voltage', () => {
        expect(calculateBatteryPercent(battery({ voltage: 12.55, state_of_charge: 64, max_error: 0 }))).toBe(64);
    });
});
