'use client';

import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type KioskStartRobotSuccessPayload = {
  nickname: string;
  pid?: number;
  message?: string;
};

export type KioskStopRobotSuccessPayload = {
  nickname: string;
  pid?: number;
  exit_code: number | null;
  message: string;
};

export type KioskStopRobotErrorPayload = {
  nickname: string;
  error: string;
};

type Unlisten = () => void;

class KioskEventManager {
  private unlistenFns: UnlistenFn[] = [];
  private initialized = false;

  private listenStartRobotHandlers = new Set<(p: KioskStartRobotSuccessPayload) => void>();
  private listenStopRobotHandlers = new Set<(p: KioskStopRobotSuccessPayload) => void>();
  private listenStopRobotErrorHandlers = new Set<(p: KioskStopRobotErrorPayload) => void>();
  private hostLogHandlers = new Set<(line: string) => void>();

  constructor() {
    // Only initialize on client to avoid SSR issues
    if (typeof window !== 'undefined') {
      void this.init();
    }
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const unlistenStartRobot = await listen<KioskStartRobotSuccessPayload>('kiosk-host-start-success', (event) => {
        for (const h of this.listenStartRobotHandlers) h(event.payload);
      });

      const unlistenStopRobot = await listen<KioskStopRobotSuccessPayload>('kiosk-host-stop-success', (event) => {
        for (const h of this.listenStopRobotHandlers) h(event.payload);
      });

      const unlistenStopRobotError = await listen<KioskStopRobotErrorPayload>('kiosk-host-stop-error', (event) => {
        for (const h of this.listenStopRobotErrorHandlers) h(event.payload);
      });

      const unlistenLog = await listen<string>('kiosk-host-log', (event) => {
        const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
        for (const h of this.hostLogHandlers) h(line);
      });

      this.unlistenFns.push(unlistenStartRobot, unlistenStopRobot, unlistenStopRobotError, unlistenLog);
    } catch (e) {
      // If listeners fail, allow retry by reloading; keep simple for now
      console.error('Failed to setup kiosk event listeners:', e);
    }
  }

  cleanup() {
    for (const fn of this.unlistenFns) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
    this.unlistenFns = [];
    this.initialized = false;
  }

  listenStartRobot(handler: (p: KioskStartRobotSuccessPayload) => void): Unlisten {
    this.listenStartRobotHandlers.add(handler);
    return () => this.listenStartRobotHandlers.delete(handler);
  }

  listenStopRobot(handler: (p: KioskStopRobotSuccessPayload) => void): Unlisten {
    this.listenStopRobotHandlers.add(handler);
    return () => this.listenStopRobotHandlers.delete(handler);
  }

  listenStopRobotError(handler: (p: KioskStopRobotErrorPayload) => void): Unlisten {
    this.listenStopRobotErrorHandlers.add(handler);
    return () => this.listenStopRobotErrorHandlers.delete(handler);
  }

  listenHostLog(handler: (line: string) => void): Unlisten {
    this.hostLogHandlers.add(handler);
    return () => this.hostLogHandlers.delete(handler);
  }
}

export const kioskEventManager = new KioskEventManager();