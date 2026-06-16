import { invoke } from '@tauri-apps/api/core';
import { addOwnedRobot, deleteOwnedRobot } from '@/api/Local/Robot/owned_robot';
import { upsertRobotTemplate } from '@/api/Local/Robot/robot';
import { setRemoteConfig } from '@/hooks/Control/remote-config.hook';
import { normalizeLanRobotDraft, type LanRobotDraft } from '@/utils/robots/lan-robot';

export const saveLanRobotDraft = async (draft: LanRobotDraft): Promise<string> => {
    const normalized = normalizeLanRobotDraft(draft);
    const robotTemplate = await upsertRobotTemplate('sourccey', 'Sourccey');
    const ownedRobot = (await addOwnedRobot(robotTemplate.id, normalized.nickname)) as {
        id: string;
    };

    try {
        const remoteConfig = {
            remote_ip: normalized.host,
            remote_port: '22',
            left_arm_port: normalized.leftArmPort,
            right_arm_port: normalized.rightArmPort,
            keyboard: 'keyboard',
            fps: 30,
        };

        await invoke('write_remote_config', {
            nickname: normalized.nickname,
            config: remoteConfig,
        });
        setRemoteConfig(normalized.nickname, remoteConfig);
        return ownedRobot.id;
    } catch (configError) {
        await deleteOwnedRobot(ownedRobot.id);
        throw configError;
    }
};
