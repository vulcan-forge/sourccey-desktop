#![allow(unused_imports)]
#![allow(dead_code)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "robot")]
pub struct Model {
    // Keep as Model (SeaORM requirement)
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String, // Keep as Uuid, serde will handle the conversion

    // Name and Description Data
    pub name: Option<String>,
    pub long_name: Option<String>,
    pub description: Option<String>,
    pub short_description: Option<String>,
    pub image: Option<String>,
    pub robot_type: Option<String>,
    pub github_url: Option<String>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {} // Keep as Relation (SeaORM requirement)

impl ActiveModelBehavior for ActiveModel {} // Keep as ActiveModel (SeaORM requirement)

// Type aliases for better readability
pub type Robot = Model;

#[allow(dead_code)]
pub type ActiveRobot = ActiveModel;
pub type RobotColumn = Column;

#[allow(dead_code)]
pub type RobotRelation = Relation;

// Helper methods for the Model (Robot)
#[allow(dead_code)]
impl Model {
    pub fn is_deleted(&self) -> bool {
        self.deleted_at.is_some()
    }

    pub fn get_display_name(&self) -> String {
        self.name.clone().unwrap_or_else(|| {
            self.long_name.clone().unwrap_or_else(|| {
                self.short_description
                    .clone()
                    .unwrap_or_else(|| "Unnamed Robot".to_string())
            })
        })
    }
}

// Implement BaseEntity trait for Robot
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

// Implement BaseActiveModel trait for ActiveRobot
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

// Helper methods for ActiveModel (ActiveRobot)
impl ActiveModel {
    pub fn new() -> Self {
        Self {
            id: Set(Uuid::now_v7().to_string()),
            name: Set(None),
            long_name: Set(None),
            description: Set(None),
            short_description: Set(None),
            image: Set(None),
            robot_type: Set(None),
            github_url: Set(None),
            created_at: Set(Some(Utc::now())),
            updated_at: Set(Some(Utc::now())),
            deleted_at: Set(None),
        }
    }

    pub fn with_name(mut self, name: String) -> Self {
        self.name = Set(Some(name));
        self
    }

    pub fn with_long_name(mut self, long_name: String) -> Self {
        self.long_name = Set(Some(long_name));
        self
    }

    pub fn with_description(mut self, description: String) -> Self {
        self.description = Set(Some(description));
        self
    }

    pub fn with_short_description(mut self, short_description: String) -> Self {
        self.short_description = Set(Some(short_description));
        self
    }

    pub fn with_image(mut self, image: String) -> Self {
        self.image = Set(Some(image));
        self
    }

    pub fn with_github_url(mut self, github_url: String) -> Self {
        self.github_url = Set(Some(github_url));
        self
    }
}
