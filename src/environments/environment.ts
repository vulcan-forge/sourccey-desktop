/**
 * Environment detection and configuration utilities
 */

export const isRobotEnvironment = (): boolean => {
    // Check for robot-specific environment variables
    return process.env.NEXT_PUBLIC_ROBOT_ENVIRONMENT === 'true';
};

export const isDesktopEnvironment = (): boolean => {
    return !isRobotEnvironment();
};

export const getEnvironmentName = (): 'desktop' | 'robot' => {
    return isRobotEnvironment() ? 'robot' : 'desktop';
};

export const getDefaultRoute = (): string => {
    if (isRobotEnvironment()) {
        // Robot environment - could have different default route
        return '/app/robots'; // For now, same as desktop
    } else {
        // Desktop environment
        return '/app/robots';
    }
};

export const getEnvironmentConfig = () => {
    return {
        isRobot: isRobotEnvironment(),
        isDesktop: isDesktopEnvironment(),
        environment: getEnvironmentName(),
        defaultRoute: getDefaultRoute(),
    };
};
