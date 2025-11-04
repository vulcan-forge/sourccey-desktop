import { RemoteRobotStatus } from '@/hooks/Control/remote-control.hook';

export const isConnected = (status: RemoteRobotStatus) => {
    return (
        status == RemoteRobotStatus.CONNECTED ||
        status == RemoteRobotStatus.STARTING ||
        status == RemoteRobotStatus.STARTED ||
        status == RemoteRobotStatus.STOPPING
    );
};

export const isConnecting = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.CONNECTING;
};

export const isDisconnecting = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.DISCONNECTING;
};

export const isStarting = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.STARTING;
};

export const isStarted = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.STARTED;
};

export const isStopping = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.STOPPING;
};

export const isNone = (status: RemoteRobotStatus) => {
    return status == RemoteRobotStatus.NONE;
};
