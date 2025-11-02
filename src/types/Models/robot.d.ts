export interface Robot {
    id: string;
    name: string | null;
    long_name: string | null;
    description: string | null;
    short_description: string | null;
    image: string | null;
    github_url: string | null;
    robot_type: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
    features: RobotFeature[];
    media: RobotMedia[];
}

export interface RobotMedia {
    id?: string | null;
    name: string;
    description: string;
    image: string;
    mediaType: string;
}

export interface RobotFeature {
    id?: string | null;
    name: string;
    description: string;
    icon: string;
}
