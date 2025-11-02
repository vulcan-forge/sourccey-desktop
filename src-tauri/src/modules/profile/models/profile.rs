#![allow(unused_imports)]
#![allow(dead_code)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "profile")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub account_id: Option<String>,

    // Handle Data - must be non-null and unique
    pub handle: String,

    // Profile Data
    pub name: Option<String>,
    pub image: Option<String>,
    pub bio: Option<String>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    // No relations needed - Profile is the parent entity
    // OwnedRobot will have a relation TO Profile, not the other way around
}

impl ActiveModelBehavior for ActiveModel {}

// Type aliases for better readability
pub type Profile = Model;
pub type ActiveProfile = ActiveModel;
pub type ProfileColumn = Column;
pub type ProfileRelation = Relation;

// Implement BaseEntity trait for Profile
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

// Helper methods for the Model (Profile)
impl Model {
    pub fn get_display_name(&self) -> String {
        self.name.clone().unwrap_or_else(|| self.handle.clone())
    }
}

// Implement BaseActiveModel trait for ActiveProfile
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

// Helper methods for ActiveModel (ActiveProfile)
impl ActiveModel {
    pub fn new() -> Self {
        Self {
            id: Set(Uuid::now_v7().to_string()),
            account_id: Set(None),
            handle: Set(Uuid::now_v7().to_string()), // Default to GUID as required
            name: Set(None),
            image: Set(None),
            bio: Set(None),
            created_at: Set(Some(Utc::now())),
            updated_at: Set(Some(Utc::now())),
            deleted_at: Set(None),
        }
    }

    pub fn with_account_id(mut self, account_id: String) -> Self {
        self.account_id = Set(Some(account_id));
        self
    }

    pub fn with_handle(mut self, handle: String) -> Self {
        self.handle = Set(handle);
        self
    }

    pub fn with_name(mut self, name: String) -> Self {
        self.name = Set(Some(name));
        self
    }

    pub fn with_image(mut self, image: String) -> Self {
        self.image = Set(Some(image));
        self
    }

    pub fn with_bio(mut self, bio: String) -> Self {
        self.bio = Set(Some(bio));
        self
    }
}
