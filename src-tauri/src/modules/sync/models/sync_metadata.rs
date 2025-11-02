#![allow(unused_imports)]

use crate::database::traits::{BaseActiveModel, BaseEntity};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "sync_metadata")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub last_sync_at: Option<DateTime<Utc>>,
    pub sync_status: Option<String>,
    pub records_synced: Option<i32>,
    pub error: Option<String>,
    pub device_id: Option<String>,

    // Timestamps
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>, // Added for soft delete support
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

// Type aliases
#[allow(dead_code)]
pub type SyncMetadata = Model;

#[allow(dead_code)]
pub type ActiveSyncMetadata = ActiveModel;

#[allow(dead_code)]
pub type SyncMetadataColumn = Column;

#[allow(dead_code)]
pub type SyncMetadataRelation = Relation;

// Helper methods
#[allow(dead_code)]
impl Model {
    pub fn is_synced(&self) -> bool {
        self.last_sync_at.is_some() && self.sync_status.as_deref() == Some("success")
    }

    pub fn get_sync_age(&self) -> Option<chrono::Duration> {
        self.last_sync_at.map(|last_sync| Utc::now() - last_sync)
    }
}

// Implement BaseEntity trait for SyncMetadata
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

// Implement BaseActiveModel trait for ActiveSyncMetadata
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

#[allow(dead_code)]
impl ActiveModel {
    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            id: Set(Uuid::now_v7().to_string()),
            last_sync_at: Set(None),
            sync_status: Set(None),
            records_synced: Set(None),
            error: Set(None),
            device_id: Set(None),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
            deleted_at: Set(None), // Added for soft delete support
        }
    }

    pub fn with_device_id(mut self, device_id: String) -> Self {
        self.device_id = Set(Some(device_id));
        self
    }

    pub fn update_sync_success(mut self, records_synced: i32) -> Self {
        let now = Utc::now();
        self.last_sync_at = Set(Some(now));
        self.sync_status = Set(Some("success".to_string()));
        self.records_synced = Set(Some(records_synced));
        self.error = Set(None);
        self.updated_at = Set(Some(now));
        self
    }

    pub fn update_sync_error(mut self, error: String) -> Self {
        let now = Utc::now();
        self.sync_status = Set(Some("error".to_string()));
        self.error = Set(Some(error));
        self.updated_at = Set(Some(now));
        self
    }
}
