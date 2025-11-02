#![allow(unused_imports)]
#![allow(dead_code)]

use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::database::traits::{BaseEntity, BaseActiveModel};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "training_run")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    // Basic Training Information
    pub name: Option<String>,
    pub description: Option<String>,
    pub model_name: Option<String>,
    pub dataset_name: Option<String>,
    pub training_config: Option<String>, // JSON string of training configuration

    // Training Status and Progress
    pub status: String, // 'pending', 'running', 'completed', 'failed', 'cancelled', 'paused'
    pub current_step: Option<i64>,
    pub total_steps: Option<i64>,
    pub current_epoch: Option<i32>,
    pub total_epochs: Option<i32>,
    pub progress_percentage: Option<f64>,

    // Training Metrics
    pub loss: Option<f64>,
    pub accuracy: Option<f64>,
    pub learning_rate: Option<f64>,
    pub validation_loss: Option<f64>,
    pub validation_accuracy: Option<f64>,

    // Training Configuration
    pub batch_size: Option<i32>,
    pub num_workers: Option<i32>,
    pub seed: Option<i32>,
    pub output_dir: Option<String>,
    pub checkpoint_path: Option<String>,
    pub log_dir: Option<String>,

    // GPU Information
    pub gpu_count: Option<i32>,
    pub gpu_models: Option<String>, // JSON array of GPU model names
    pub gpu_memory_used: Option<i64>, // Total GPU memory used in bytes
    pub gpu_utilization: Option<f64>, // Average GPU utilization percentage
    pub multi_gpu: Option<bool>,

    // System Information
    pub cpu_count: Option<i32>,
    pub memory_used: Option<i64>, // Memory used in bytes
    pub system_info: Option<String>, // JSON object with system details

    // Execution Information
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_seconds: Option<i64>,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub output_log: Option<String>,

    // Performance Metrics
    pub samples_per_second: Option<f64>,
    pub steps_per_second: Option<f64>,
    pub throughput: Option<f64>,

    // Relationships
    pub profile_id: Option<String>,
    pub robot_id: Option<String>,
    pub owned_robot_id: Option<String>,

    // External Integration
    pub wandb_run_id: Option<String>,
    pub wandb_project: Option<String>,
    pub mlflow_run_id: Option<String>,
    pub tensorboard_url: Option<String>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "crate::modules::profile::models::profile::Entity",
        from = "Column::ProfileId",
        to = "crate::modules::profile::models::profile::Column::Id"
    )]
    Profile,

    #[sea_orm(
        belongs_to = "crate::modules::robot::models::robot::Entity",
        from = "Column::RobotId",
        to = "crate::modules::robot::models::robot::Column::Id"
    )]
    Robot,

    #[sea_orm(
        belongs_to = "crate::modules::robot::models::owned_robot::Entity",
        from = "Column::OwnedRobotId",
        to = "crate::modules::robot::models::owned_robot::Column::Id"
    )]
    OwnedRobot,
}

impl Related<crate::modules::profile::models::profile::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Profile.def()
    }
}

impl Related<crate::modules::robot::models::robot::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Robot.def()
    }
}

impl Related<crate::modules::robot::models::owned_robot::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::OwnedRobot.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

// Type aliases for better readability
pub type TrainingRun = Model;
pub type ActiveTrainingRun = ActiveModel;
pub type TrainingRunColumn = Column;
pub type TrainingRunRelation = Relation;

// Helper methods for the Model (TrainingRun)
impl Model {
    pub fn is_deleted(&self) -> bool {
        self.deleted_at.is_some()
    }

    pub fn is_running(&self) -> bool {
        self.status == "running"
    }

    pub fn is_completed(&self) -> bool {
        self.status == "completed"
    }

    pub fn is_failed(&self) -> bool {
        self.status == "failed"
    }

    pub fn is_cancelled(&self) -> bool {
        self.status == "cancelled"
    }

    pub fn is_paused(&self) -> bool {
        self.status == "paused"
    }

    pub fn is_pending(&self) -> bool {
        self.status == "pending"
    }

    pub fn get_display_name(&self) -> String {
        self.name.clone().unwrap_or_else(|| {
            format!("Training Run {}", self.id[..8].to_string())
        })
    }

    pub fn get_duration_formatted(&self) -> Option<String> {
        self.duration_seconds.map(|seconds| {
            if seconds < 60 {
                format!("{}s", seconds)
            } else if seconds < 3600 {
                let minutes = seconds / 60;
                let remaining_seconds = seconds % 60;
                format!("{}m {}s", minutes, remaining_seconds)
            } else {
                let hours = seconds / 3600;
                let remaining_minutes = (seconds % 3600) / 60;
                format!("{}h {}m", hours, remaining_minutes)
            }
        })
    }

    pub fn get_progress_percentage(&self) -> f64 {
        if let Some(percentage) = self.progress_percentage {
            percentage
        } else if let (Some(current), Some(total)) = (self.current_step, self.total_steps) {
            if total > 0 {
                (current as f64 / total as f64) * 100.0
            } else {
                0.0
            }
        } else if let (Some(current), Some(total)) = (self.current_epoch, self.total_epochs) {
            if total > 0 {
                (current as f64 / total as f64) * 100.0
            } else {
                0.0
            }
        } else {
            0.0
        }
    }

    pub fn get_gpu_info(&self) -> Option<Vec<String>> {
        self.gpu_models.as_ref().and_then(|models| {
            serde_json::from_str::<Vec<String>>(models).ok()
        })
    }

    pub fn get_system_info(&self) -> Option<serde_json::Value> {
        self.system_info.as_ref().and_then(|info| {
            serde_json::from_str::<serde_json::Value>(info).ok()
        })
    }

    pub fn get_training_config(&self) -> Option<serde_json::Value> {
        self.training_config.as_ref().and_then(|config| {
            serde_json::from_str::<serde_json::Value>(config).ok()
        })
    }
}

// Implement BaseEntity trait for TrainingRun
impl BaseEntity for Model {
    fn created_at(&self) -> Option<DateTime<Utc>> {
        self.created_at
    }

    fn updated_at(&self) -> Option<DateTime<Utc>> {
        self.updated_at
    }

    fn deleted_at(&self) -> Option<DateTime<Utc>> {
        self.deleted_at
    }
}

// Implement BaseActiveModel trait for ActiveTrainingRun
impl BaseActiveModel for ActiveModel {
    fn soft_delete(&mut self) {
        self.deleted_at = Set(Some(Utc::now()));
        self.updated_at = Set(Some(Utc::now()));
    }

    fn update_timestamp(&mut self) {
        self.updated_at = Set(Some(Utc::now()));
    }

    fn set_created_at(&mut self) {
        self.created_at = Set(Some(Utc::now()));
        self.updated_at = Set(Some(Utc::now()));
    }

    fn clear_deleted_at(&mut self) {
        self.deleted_at = Set(None);
    }
}

// Helper methods for ActiveModel (ActiveTrainingRun)
impl ActiveModel {
    pub fn new() -> Self {
        Self {
            id: Set(Uuid::now_v7().to_string()),
            name: Set(None),
            description: Set(None),
            model_name: Set(None),
            dataset_name: Set(None),
            training_config: Set(None),
            status: Set("pending".to_string()),
            current_step: Set(None),
            total_steps: Set(None),
            current_epoch: Set(None),
            total_epochs: Set(None),
            progress_percentage: Set(None),
            loss: Set(None),
            accuracy: Set(None),
            learning_rate: Set(None),
            validation_loss: Set(None),
            validation_accuracy: Set(None),
            batch_size: Set(None),
            num_workers: Set(None),
            seed: Set(None),
            output_dir: Set(None),
            checkpoint_path: Set(None),
            log_dir: Set(None),
            gpu_count: Set(None),
            gpu_models: Set(None),
            gpu_memory_used: Set(None),
            gpu_utilization: Set(None),
            multi_gpu: Set(None),
            cpu_count: Set(None),
            memory_used: Set(None),
            system_info: Set(None),
            started_at: Set(None),
            completed_at: Set(None),
            duration_seconds: Set(None),
            exit_code: Set(None),
            error_message: Set(None),
            output_log: Set(None),
            samples_per_second: Set(None),
            steps_per_second: Set(None),
            throughput: Set(None),
            profile_id: Set(None),
            robot_id: Set(None),
            owned_robot_id: Set(None),
            wandb_run_id: Set(None),
            wandb_project: Set(None),
            mlflow_run_id: Set(None),
            tensorboard_url: Set(None),
            created_at: Set(Some(Utc::now())),
            updated_at: Set(Some(Utc::now())),
            deleted_at: Set(None),
        }
    }

    // Basic information setters
    pub fn with_name(mut self, name: String) -> Self {
        self.name = Set(Some(name));
        self
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = Set(Some(description));
        self
    }

    pub fn with_model_name(mut self, model_name: String) -> Self {
        self.model_name = Set(Some(model_name));
        self
    }

    pub fn with_dataset_name(mut self, dataset_name: String) -> Self {
        self.dataset_name = Set(Some(dataset_name));
        self
    }

    pub fn with_training_config(mut self, config: serde_json::Value) -> Self {
        self.training_config = Set(Some(config.to_string()));
        self
    }

    // Status and progress setters
    pub fn with_status(mut self, status: String) -> Self {
        self.status = Set(status);
        self
    }

    pub fn with_total_steps(mut self, total_steps: i64) -> Self {
        self.total_steps = Set(Some(total_steps));
        self
    }

    pub fn with_total_epochs(mut self, total_epochs: i32) -> Self {
        self.total_epochs = Set(Some(total_epochs));
        self
    }

    pub fn update_progress(mut self, current_step: i64, current_epoch: Option<i32>) -> Self {
        self.current_step = Set(Some(current_step));
        if let Some(epoch) = current_epoch {
            self.current_epoch = Set(Some(epoch));
        }
        self
    }

    // Training configuration setters
    pub fn with_batch_size(mut self, batch_size: i32) -> Self {
        self.batch_size = Set(Some(batch_size));
        self
    }

    pub fn with_num_workers(mut self, num_workers: i32) -> Self {
        self.num_workers = Set(Some(num_workers));
        self
    }

    pub fn with_seed(mut self, seed: i32) -> Self {
        self.seed = Set(Some(seed));
        self
    }

    pub fn with_output_dir(mut self, output_dir: String) -> Self {
        self.output_dir = Set(Some(output_dir));
        self
    }

    // GPU information setters
    pub fn with_gpu_count(mut self, gpu_count: i32) -> Self {
        self.gpu_count = Set(Some(gpu_count));
        self
    }

    pub fn with_gpu_models(mut self, gpu_models: Vec<String>) -> Self {
        self.gpu_models = Set(Some(serde_json::to_string(&gpu_models).unwrap_or_default()));
        self
    }

    pub fn with_multi_gpu(mut self, multi_gpu: bool) -> Self {
        self.multi_gpu = Set(Some(multi_gpu));
        self
    }

    pub fn with_gpu_memory_used(mut self, memory_bytes: i64) -> Self {
        self.gpu_memory_used = Set(Some(memory_bytes));
        self
    }

    pub fn with_gpu_utilization(mut self, utilization_percentage: f64) -> Self {
        self.gpu_utilization = Set(Some(utilization_percentage));
        self
    }

    // System information setters
    pub fn with_cpu_count(mut self, cpu_count: i32) -> Self {
        self.cpu_count = Set(Some(cpu_count));
        self
    }

    pub fn with_memory_used(mut self, memory_bytes: i64) -> Self {
        self.memory_used = Set(Some(memory_bytes));
        self
    }

    pub fn with_system_info(mut self, system_info: serde_json::Value) -> Self {
        self.system_info = Set(Some(system_info.to_string()));
        self
    }

    // Relationship setters
    pub fn with_profile_id(mut self, profile_id: String) -> Self {
        self.profile_id = Set(Some(profile_id));
        self
    }

    pub fn with_robot_id(mut self, robot_id: String) -> Self {
        self.robot_id = Set(Some(robot_id));
        self
    }

    pub fn with_owned_robot_id(mut self, owned_robot_id: String) -> Self {
        self.owned_robot_id = Set(Some(owned_robot_id));
        self
    }

    // External integration setters
    pub fn with_wandb_run_id(mut self, wandb_run_id: String) -> Self {
        self.wandb_run_id = Set(Some(wandb_run_id));
        self
    }

    pub fn with_wandb_project(mut self, wandb_project: String) -> Self {
        self.wandb_project = Set(Some(wandb_project));
        self
    }

    pub fn with_mlflow_run_id(mut self, mlflow_run_id: String) -> Self {
        self.mlflow_run_id = Set(Some(mlflow_run_id));
        self
    }

    pub fn with_tensorboard_url(mut self, tensorboard_url: String) -> Self {
        self.tensorboard_url = Set(Some(tensorboard_url));
        self
    }

    // Execution control methods
    pub fn start_training(mut self) -> Self {
        let now = Utc::now();
        self.status = Set("running".to_string());
        self.started_at = Set(Some(now));
        self.updated_at = Set(Some(now));
        self
    }

    pub fn complete_training(mut self, exit_code: i32) -> Self {
        let now = Utc::now();
        self.status = Set(if exit_code == 0 { "completed".to_string() } else { "failed".to_string() });
        self.completed_at = Set(Some(now));
        self.exit_code = Set(Some(exit_code));
        self.updated_at = Set(Some(now));

        // Calculate duration if started_at is available
        if let Set(Some(started)) = &self.started_at {
            self.duration_seconds = Set(Some((now - *started).num_seconds()));
        }
        self
    }

    pub fn fail_training(mut self, error_message: String) -> Self {
        let now = Utc::now();
        self.status = Set("failed".to_string());
        self.completed_at = Set(Some(now));
        self.error_message = Set(Some(error_message));
        self.updated_at = Set(Some(now));
        self
    }

    pub fn cancel_training(mut self) -> Self {
        let now = Utc::now();
        self.status = Set("cancelled".to_string());
        self.completed_at = Set(Some(now));
        self.updated_at = Set(Some(now));
        self
    }

    pub fn pause_training(mut self) -> Self {
        self.status = Set("paused".to_string());
        self.updated_at = Set(Some(Utc::now()));
        self
    }

    pub fn resume_training(mut self) -> Self {
        self.status = Set("running".to_string());
        self.updated_at = Set(Some(Utc::now()));
        self
    }

    // Metrics update methods
    pub fn update_metrics(mut self, loss: Option<f64>, accuracy: Option<f64>, learning_rate: Option<f64>) -> Self {
        if let Some(loss_val) = loss {
            self.loss = Set(Some(loss_val));
        }
        if let Some(acc) = accuracy {
            self.accuracy = Set(Some(acc));
        }
        if let Some(lr) = learning_rate {
            self.learning_rate = Set(Some(lr));
        }
        self.updated_at = Set(Some(Utc::now()));
        self
    }

    pub fn update_validation_metrics(mut self, validation_loss: Option<f64>, validation_accuracy: Option<f64>) -> Self {
        if let Some(val_loss) = validation_loss {
            self.validation_loss = Set(Some(val_loss));
        }
        if let Some(val_acc) = validation_accuracy {
            self.validation_accuracy = Set(Some(val_acc));
        }
        self.updated_at = Set(Some(Utc::now()));
        self
    }

    pub fn update_performance_metrics(mut self, samples_per_second: Option<f64>, steps_per_second: Option<f64>) -> Self {
        if let Some(sps) = samples_per_second {
            self.samples_per_second = Set(Some(sps));
        }
        if let Some(steps_ps) = steps_per_second {
            self.steps_per_second = Set(Some(steps_ps));
        }
        self.updated_at = Set(Some(Utc::now()));
        self
    }

    pub fn update_output_log(mut self, log_entry: String) -> Self {
        let current_log = match &self.output_log {
            Set(Some(existing)) => existing.clone(),
            _ => String::new(),
        };

        let updated_log = if current_log.is_empty() {
            log_entry
        } else {
            format!("{}\n{}", current_log, log_entry)
        };

        self.output_log = Set(Some(updated_log));
        self.updated_at = Set(Some(Utc::now()));
        self
    }
}
