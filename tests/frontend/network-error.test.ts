// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { networkErrorMessage } from '../../src/utils/network-error';

describe('kiosk network errors', () => {
    test('turns the reported missing-secret error into actionable instructions', () => {
        const error =
            "Warning: password for '802-11-wireless-security.psk' not given in 'passwd-file' and nmcli cannot ask without '--ask'. Error: Secrets were required, but not provided. Hint: journalctl -xe NM_CONNECTION=profile-id";
        const message = networkErrorMessage(error, 'Could not connect to Wi-Fi');
        expect(message).toContain('Check the password');
        expect(message).not.toMatch(/nmcli|journalctl|passwd-file|profile-id|Warning|Error:/);
    });
    test('unknown errors never echo diagnostics or credentials', () => {
        expect(networkErrorMessage('D-Bus failed: password=my-secret NM_CONNECTION=123', 'Could not connect Ethernet')).toBe(
            'Could not connect Ethernet. Check the connection and try again.'
        );
    });
    test('DHCP failures and permission failures have different remedies', () => {
        expect(networkErrorMessage('IP configuration unavailable (DHCP timeout)', 'Failed')).toContain('did not assign an IP address');
        expect(networkErrorMessage('Disconnect not authorized', 'Failed')).toContain('network permission repair');
    });
    test('safe validation messages survive, but appended system errors do not', () => {
        expect(networkErrorMessage('The Wi-Fi password must contain 8 to 63 bytes', 'Failed')).toBe(
            'The Wi-Fi password must contain 8 to 63 bytes'
        );
        expect(networkErrorMessage('The Wi-Fi password is invalid. Error: nmcli echoed a secret', 'Failed')).not.toContain('secret');
    });
});
