#![allow(unused_imports)]
#![allow(dead_code)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "ai_model")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    // Model Data
    pub name: String,
    pub model_path: String,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

// Type aliases for better readability
pub type AiModel = Model;
pub type ActiveAiModel = ActiveModel;
pub type AiModelColumn = Column;
pub type AiModelRelation = Relation;

// Implement BaseEntity trait for AiModel
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

// Implement BaseActiveModel trait for ActiveAiModel
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

// Helper methods for ActiveModel
impl ActiveModel {
    pub fn new(name: String, model_path: String) -> Self {
        Self {
            id: Set(Uuid::now_v7().to_string()),
            name: Set(name),
            model_path: Set(model_path),
            created_at: Set(Some(Utc::now())),
            updated_at: Set(Some(Utc::now())),
            deleted_at: Set(None),
        }
    }
}
