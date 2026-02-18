#![allow(unused_imports)]
#![allow(dead_code)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "command_log")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    // Command Data
    pub command: String,
    pub description: Option<String>,
    pub status: String, // 'success', 'failed', 'running', 'cancelled'
    pub exit_code: Option<i32>,
    pub output: Option<String>,
    pub error_message: Option<String>,

    // Relationships
    pub robot_id: Option<String>,
    pub owned_robot_id: Option<String>,

    // Execution Data
    pub execution_time_ms: Option<i64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
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
pub type CommandLog = Model;

#[allow(dead_code)]
pub type ActiveCommandLog = ActiveModel;
pub type CommandLogColumn = Column;

#[allow(dead_code)]
pub type CommandLogRelation = Relation;

// Helper methods for the Model (CommandLog)
#[allow(dead_code)]
impl Model {
    pub fn is_deleted(&self) -> bool {
        self.deleted_at.is_some()
    }

    pub fn is_success(&self) -> bool {
        self.status == "success"
    }

    pub fn is_failed(&self) -> bool {
        self.status == "failed"
    }

    pub fn is_running(&self) -> bool {
        self.status == "running"
    }

    pub fn is_cancelled(&self) -> bool {
        self.status == "cancelled"
    }

    pub fn get_duration_seconds(&self) -> Option<f64> {
        self.execution_time_ms.map(|ms| ms as f64 / 1000.0)
    }

    pub fn get_formatted_duration(&self) -> Option<String> {
        self.get_duration_seconds().map(|seconds| {
            if seconds < 60.0 {
                format!("{:.1}s", seconds)
            } else if seconds < 3600.0 {
                let minutes = (seconds / 60.0) as i32;
                let remaining_seconds = (seconds % 60.0) as i32;
                format!("{}m {}s", minutes, remaining_seconds)
            } else {
                let hours = (seconds / 3600.0) as i32;
                let remaining_minutes = ((seconds % 3600.0) / 60.0) as i32;
                format!("{}h {}m", hours, remaining_minutes)
            }
        })
    }

    //-------------------------------------------------------------------------//
    // Get CommandLog Functions
    //-------------------------------------------------------------------------//
    pub async fn get(connection: &DatabaseConnection, id: String) -> Result<Option<Self>, DbErr> {
        Entity::find_by_id(id)
            .filter(Column::DeletedAt.is_null())
            .one(connection)
            .await
    }
}

// Implement BaseEntity trait for CommandLog
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

// Implement BaseActiveModel trait for ActiveCommandLog
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

// Helper methods for ActiveModel (ActiveCommandLog)
impl ActiveModel {
    pub fn new() -> Self {
        Self {
            id: Set(Uuid::now_v7().to_string()),
            command: Set(String::new()),
            description: Set(None),
            status: Set("running".to_string()),
            exit_code: Set(None),
            output: Set(None),
            error_message: Set(None),
            robot_id: Set(None),
            owned_robot_id: Set(None),
            execution_time_ms: Set(None),
            started_at: Set(Utc::now()),
            completed_at: Set(None),
            created_at: Set(Some(Utc::now())),
            updated_at: Set(Some(Utc::now())),
            deleted_at: Set(None),
        }
    }

    pub fn with_command(mut self, command: String) -> Self {
        self.command = Set(command);
        self
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = Set(Some(description));
        self
    }

    pub fn with_status(mut self, status: String) -> Self {
        self.status = Set(status);
        self
    }

    pub fn with_exit_code(mut self, exit_code: i32) -> Self {
        self.exit_code = Set(Some(exit_code));
        self
    }

    pub fn with_output(mut self, output: String) -> Self {
        self.output = Set(Some(output));
        self
    }

    pub fn with_error_message(mut self, error_message: String) -> Self {
        self.error_message = Set(Some(error_message));
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

    pub fn with_execution_time(mut self, execution_time_ms: i64) -> Self {
        self.execution_time_ms = Set(Some(execution_time_ms));
        self
    }

    pub fn with_started_at(mut self, started_at: DateTime<Utc>) -> Self {
        self.started_at = Set(started_at);
        self
    }

    pub fn with_completed_at(mut self, completed_at: DateTime<Utc>) -> Self {
        self.completed_at = Set(Some(completed_at));
        self
    }

    pub fn mark_completed(mut self) -> Self {
        self.completed_at = Set(Some(Utc::now()));
        self
    }

    pub fn mark_success(mut self) -> Self {
        self.status = Set("success".to_string());
        self.mark_completed()
    }

    pub fn mark_failed(mut self, error_message: Option<String>) -> Self {
        self.status = Set("failed".to_string());
        if let Some(error) = error_message {
            self.error_message = Set(Some(error));
        }
        self.mark_completed()
    }

    pub fn mark_cancelled(mut self) -> Self {
        self.status = Set("cancelled".to_string());
        self.mark_completed()
    }
}
