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

export const getOwnedRobots = async (profile_id: string) => {
    try {
        const result = await invoke('get_owned_robots_by_profile', { profileId: profile_id });
        return result;
    } catch (error) {
        console.error('getOwnedRobots error:', error);
        throw error;
    }
};

//-------------------------------------------------//
// CREATE Robot Functions
//-------------------------------------------------//
export const addOwnedRobot = async (profile_id: string, robot_id: string, nickname: string) => {
    const request = {
        profile_id,
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
