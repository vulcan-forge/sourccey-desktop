import { requestRest } from '@/api/Api';
import type { Robot } from '@/types/Models/robot';

export type GetRobotInput = { id?: string | null; name?: string | null };
export type RobotListParameters = { limit?: number; cursor?: string | null; sort?: string; search?: string };
export type ResourcePage<T> = { items: T[]; totalCount: number; nextCursor: string | null; previousCursor: string | null };

export const queryRobot = (input: GetRobotInput) => requestRest<Robot>('robots/lookup', input);
export const queryRobots = (parameters: RobotListParameters = {}) => requestRest<ResourcePage<Robot>>('robots', parameters);
