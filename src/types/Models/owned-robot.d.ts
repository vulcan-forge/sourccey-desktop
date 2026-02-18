export interface OwnedRobot {
    id: string; // Guid in C# maps to string in TypeScript
    robot_id: string; // Guid in C# maps to string in TypeScript
    robot: Robot; // Navigation property
    nickname?: string; // nullable string in C# maps to optional string in TypeScript
    registration_date: string; // DateTime in C# maps to string in TypeScript (ISO format)
    confirmation_date: string; // DateTime in C# maps to string in TypeScript (ISO format)
    last_active_date: string; // DateTime in C# maps to string in TypeScript (ISO format)
    created_at: string; // DateTime in C# maps to string in TypeScript (ISO format)
    updated_at: string; // DateTime in C# maps to string in TypeScript (ISO format)
    deleted_at: string; // DateTime in C# maps to string in TypeScript (ISO format)
}
