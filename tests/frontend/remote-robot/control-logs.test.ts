// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { appendCondensedLogs, sanitizeLogLine } from '@/utils/logs/control-logs/log-stream';

describe('appendCondensedLogs', () => {
    it('collapses consecutive duplicate log lines', () => {
        expect(appendCondensedLogs([], ['[robot-1] waiting', '[robot-1] waiting', '[robot-1] waiting'])).toEqual([
            '[robot-1] waiting [repeated x3]',
        ]);
    });

    it('preserves distinct log lines around repeated ones', () => {
        expect(
            appendCondensedLogs(['[robot-1] Command: uv run lerobot-teleoperate'], ['[robot-1] waiting', '[robot-1] waiting', '[robot-1] ready'])
        ).toEqual([
            '[robot-1] Command: uv run lerobot-teleoperate',
            '[robot-1] waiting [repeated x2]',
            '[robot-1] ready',
        ]);
    });

    it('strips terminal cursor-control sequences from teleop output', () => {
        expect(sanitizeLogLine('\u001b[10A[robot-1] Teleop loop time: 33.3ms (30 Hz)\r')).toBe('[robot-1] Teleop loop time: 33.3ms (30 Hz)');
    });
});
