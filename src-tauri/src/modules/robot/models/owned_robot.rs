#![allow(unused_imports)]
#![allow(dead_code)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use crate::modules::robot::models::robot::Robot;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "owned_robot")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub robot_id: String,
    pub nickname: Option<String>,
    pub registration_date: DateTime<Utc>,
    pub confirmation_date: DateTime<Utc>,
    pub last_active_date: DateTime<Utc>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OwnedRobotWithRelations {
    #[serde(flatten)]
    pub owned_robot: OwnedRobot,
    pub robot: Option<Robot>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::robot::Entity",
        from = "Column::RobotId",
        to = "super::robot::Column::Id"
    )]
    Robot,
}

impl Related<super::robot::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Robot.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

// Type aliases for better readability
pub type OwnedRobot = Model;
pub type ActiveOwnedRobot = ActiveModel;
pub type OwnedRobotColumn = Column;
pub type OwnedRobotRelation = Relation;

// Helper methods for the Model (OwnedRobot)
#[allow(dead_code)]
impl Model {
    pub fn is_active(&self) -> bool {
        // Consider active if last_active_date is within the last 30 days
        let thirty_days_ago = Utc::now() - chrono::Duration::days(30);
        self.last_active_date > thirty_days_ago
    }

    pub fn get_display_name(&self) -> String {
        self.nickname.clone().unwrap_or_else(|| {
            // You might want to get the robot name here if you have access to the relation
            "Unnamed Owned Robot".to_string()
        })
    }
}

// Implement BaseEntity trait for OwnedRobot
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

// Helper methods for ActiveModel (ActiveOwnedRobot)
impl ActiveModel {
    pub fn new(robot_id: String) -> Self {
        let now = Utc::now();
        Self {
            id: Set(Uuid::now_v7().to_string()),
            robot_id: Set(robot_id),
            nickname: Set(None),
            registration_date: Set(now),
            confirmation_date: Set(now), // Initially set to registration date
            last_active_date: Set(now),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
            deleted_at: Set(None), // Added for soft delete support
        }
    }

    pub fn with_nickname(mut self, nickname: String) -> Self {
        self.nickname = Set(Some(nickname));
        self
    }

    pub fn update_last_active(&mut self) {
        self.last_active_date = Set(Utc::now());
    }

    pub fn confirm_registration(&mut self) {
        self.confirmation_date = Set(Utc::now());
    }
}

// Implement BaseActiveModel trait for ActiveOwnedRobot
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
