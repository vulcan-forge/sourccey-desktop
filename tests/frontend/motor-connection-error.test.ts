// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { getMotorConnectionToastMessage } from '../../src/utils/robot/motor-connection-error';

describe('motor connection error toast', () => {
    test('identifies missing motors and the left arm from a motor check', () => {
        const error = `FeetechMotorsBus motor check failed on port '/dev/robotLeftArm':
Missing motor IDs:
  - 3 (expected model: 777)
  - 4 (expected model: 777)
Full expected motor list (id: model_number):
{1: 111, 2: 222, 3: 777, 4: 777}
Full found motor list (id: model_number):
{1: 111, 2: 222}`;

        expect(getMotorConnectionToastMessage(error)).toBe(
            'Check the motor wires on the left arm. Motors 3, 4 are likely not connected.',
        );
    });

    test('computes missing IDs from expected and found maps', () => {
        const error = `Motor check failed on right_arm
Full expected motor list (id: model_number):
{1: 111, 2: 222, 3: 333}
Full found motor list (id: model_number):
{1: 111, 3: 333}`;

        expect(getMotorConnectionToastMessage(error)).toBe(
            'Check the motor wires on the right arm. Motor 2 is likely not connected.',
        );
    });

    test('leaves unrelated errors alone', () => {
        expect(getMotorConnectionToastMessage('Network is unreachable')).toBeNull();
    });
});
