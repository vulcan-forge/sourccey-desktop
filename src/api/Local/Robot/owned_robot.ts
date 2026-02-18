import { invoke } from '@tauri-apps/api/core';

//-------------------------------------------------//
// GET Robot Functions
//-------------------------------------------------//
export const getOwnedRobotById = async (id: string) => {
    const result = await invoke('get_owned_robot_by_id', { id });
    return result;
};

export const getOwnedRobotByNickname = async (nickname: string) => {
    const result = await invoke('get_owned_robot_by_nickname', { nickname });
    return result;
};

export const getOwnedRobots = async () => {
    try {
        const result = await invoke('get_owned_robots', {});
        return result;
    } catch (error) {
        console.error('getOwnedRobots error:', error);
        throw error;
    }
};

//-------------------------------------------------//
// CREATE Robot Functions
//-------------------------------------------------//
export const addOwnedRobot = async (robot_id: string, nickname: string) => {
    const request = {
        robot_id,
        nickname,
    };
    const result = await invoke('add_owned_robot', { request });
    return result;
};

//-------------------------------------------------//
// DELETE Robot Functions
//-------------------------------------------------//
export const deleteOwnedRobot = async (id: string) => {
    const result = await invoke('delete_owned_robot', { id });
    return result;
};
