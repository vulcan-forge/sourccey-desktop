export interface Dataset {
    repo_id: string;
    nickname: string;
    dataset: string;
    path: string;
    episodes: number;
    tasks: TaskOverview;
    size: number;
    robot_type: string;
    updated_at: string;
}

export interface TaskOverview {
    task_list: string[];
    total_tasks: number;
}
