#![allow(dead_code)]

use chrono::{DateTime, Utc};
#[allow(unused_imports)]
use sea_orm::Set;

/// Base entity trait that provides common functionality for all entities
pub trait BaseEntity {
    /// Get creation timestamp
    fn created_at(&self) -> Option<DateTime<Utc>>;

    /// Get update timestamp
    fn updated_at(&self) -> Option<DateTime<Utc>>;

    /// Get deletion timestamp
    fn deleted_at(&self) -> Option<DateTime<Utc>>;

    /// Check if the entity has been soft deleted
    fn is_deleted(&self) -> bool {
        self.deleted_at().is_some()
    }
}

/// Base active model trait for common operations
pub trait BaseActiveModel {
    /// Soft delete the entity
    fn soft_delete(&mut self);

    /// Update the timestamp
    fn update_timestamp(&mut self);

    /// Set creation timestamp
    fn set_created_at(&mut self);

    /// Clear the deleted_at field
    fn clear_deleted_at(&mut self);
}
