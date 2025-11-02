use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Dataset {
    pub repo_id: String,  // repository id {nickname/dataset}
    pub nickname: String, // robot nickname
    pub dataset: String,  // dataset name
    pub path: String,
    pub episodes: usize,
    pub tasks: TaskOverview,
    pub size: usize,
    pub robot_type: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskOverview {
    pub task_list: Vec<String>,
    pub total_tasks: usize,
}
