import { FaPowerOff } from 'react-icons/fa';

import { FaBatteryFull, FaNetworkWired, FaRadiation, FaSearchLocation } from 'react-icons/fa';

import {
    FaBolt,
    FaBrain,
    FaClock,
    FaCog,
    FaDatabase,
    FaEye,
    FaMagnet,
    FaMemory,
    FaMicrochip,
    FaRobot,
    FaSatellite,
    FaServer,
    FaShieldAlt,
    FaWifi,
    FaWrench,
} from 'react-icons/fa';

export const FEATURE_ICONS = {
    clock: { icon: FaClock, label: 'Clock' },
    bolt: { icon: FaBolt, label: 'Electric' },
    robot: { icon: FaRobot, label: 'Robot' },
    cog: { icon: FaCog, label: 'Settings' },
    wrench: { icon: FaWrench, label: 'Tools' },
    chip: { icon: FaMicrochip, label: 'Processor' },
    memory: { icon: FaMemory, label: 'Memory' },
    brain: { icon: FaBrain, label: 'AI' },
    server: { icon: FaServer, label: 'Server' },
    database: { icon: FaDatabase, label: 'Database' },
    wifi: { icon: FaWifi, label: 'Wireless' },
    satellite: { icon: FaSatellite, label: 'Satellite' },
    shield: { icon: FaShieldAlt, label: 'Security' },
    eye: { icon: FaEye, label: 'Vision' },
    magnet: { icon: FaMagnet, label: 'Magnetic' },
    battery: { icon: FaBatteryFull, label: 'Power' },
    sensor: { icon: FaSearchLocation, label: 'Sensor' },
    network: { icon: FaNetworkWired, label: 'Network' },
    radiation: { icon: FaRadiation, label: 'Radiation' },
    power: { icon: FaPowerOff, label: 'Power Control' },
} as const;
