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

describe('battery calculations', () => {
    test('estimates charge and discharge time only from usable measurements', () => {
        expect(getBatteryTimeEstimate(battery({ current_a: -2, remaining_capacity_ah: 3 }))).toBe(1.5);
        expect(getBatteryTimeEstimate(battery({ current_a: 2, remaining_capacity_ah: 3, max_capacity_ah: 8 }))).toBe(2.5);
        expect(getBatteryTimeEstimate(battery({ current_a: 0.01 }))).toBeNull();
        expect(getBatteryTimeEstimate(battery({ remaining_capacity_ah: -1 }))).toBeNull();
    });

    test('treats unloaded data as unknown', () => {
        expect(
            getBatteryChargeState(battery({ voltage: -1, current_a: -1, remaining_capacity_ah: -1, max_capacity_ah: -1, state_of_charge: -1 }))
        ).toBe('unknown');
    });

    test('uses reliable gauge values and falls back to voltage for a false zero', () => {
        expect(calculateBatteryPercent(battery({ voltage: 12.55, state_of_charge: 0, max_error: 0 }))).toBe(50);
        expect(calculateBatteryPercent(battery({ voltage: 11.5, state_of_charge: 0, max_error: 0 }))).toBe(0);
        expect(calculateBatteryPercent(battery({ voltage: 12.55, state_of_charge: 64, max_error: 0 }))).toBe(64);
    });
});
