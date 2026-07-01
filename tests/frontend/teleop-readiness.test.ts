// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { getRemoteTeleopBlockingMessage, getRemoteTeleopReadiness } from '../../src/utils/teleop/remote-teleop-readiness';

describe('remote teleop readiness', () => {
    it('reports ready only when config and calibration are complete', () => {
        const ready = getRemoteTeleopReadiness(
            {
                remote_ip: '192.168.1.50',
                left_arm_port: 'COM3',
                right_arm_port: 'COM4',
                keyboard: 'keyboard',
                fps: 30,
            },
            { isCalibrated: true }
        );

        expect(ready.ready).toBe(true);
        expect(ready.blockingIssues).toEqual([]);
        expect(ready.advisoryIssues).toEqual([]);
    });

    it('surfaces missing setup steps in plain language', () => {
        const readiness = getRemoteTeleopReadiness(
            {
                remote_ip: '',
                left_arm_port: 'COM3',
                right_arm_port: '',
                keyboard: '',
                fps: 0,
            },
            { isCalibrated: false }
        );

        expect(readiness.ready).toBe(false);
        expect(readiness.blockingIssues).toContain('Set the robot host or IP address in Config.');
        expect(readiness.blockingIssues).toContain('Set the right arm port below or in Config.');
        expect(readiness.blockingIssues).toContain('Set the keyboard or input device in Config.');
        expect(readiness.blockingIssues).toContain('Set FPS to a value greater than 0.');
        expect(readiness.blockingIssues).toContain('Run teleoperator calibration before starting teleoperation.');
        expect(getRemoteTeleopBlockingMessage(readiness)).toContain('Set the robot host or IP address in Config.');
    });

    it('allows teleop to start with leader fallback when ports or calibration are missing', () => {
        const readiness = getRemoteTeleopReadiness(
            {
                remote_ip: '192.168.1.50',
                left_arm_port: '',
                right_arm_port: '',
                keyboard: 'keyboard',
                fps: 30,
            },
            { isCalibrated: false },
            { allowLeaderFallback: true }
        );

        expect(readiness.ready).toBe(true);
        expect(readiness.blockingIssues).toEqual([]);
        expect(readiness.advisoryIssues).toContain('Set the left arm port below or in Config.');
        expect(readiness.advisoryIssues).toContain('Set the right arm port below or in Config.');
        expect(readiness.advisoryIssues).toContain('Run teleoperator calibration before starting teleoperation.');
    });
});
