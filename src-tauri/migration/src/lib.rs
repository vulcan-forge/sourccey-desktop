pub use sea_orm_migration::prelude::*;

mod m20250714_000601_initial_migration;
mod m20250715_000001_add_command_log_table;
mod m20250723_000001_add_training_run_table;
mod m20250724_000001_add_unique_nickname_index_to_owned_robot;
mod m20250725_000001_add_robot_type_to_robot;
mod m20250726_000001_add_command_log_foreign_key_indexes;
mod m20250109_000001_drop_cart_item_table;
mod m20250727_000001_add_owned_robot_indexes;
mod m20260219_000001_drop_owned_robot_profile_id;
mod m20260219_000002_add_ai_model_table;
mod m20260220_000001_add_ai_model_metadata;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250714_000601_initial_migration::Migration),
            Box::new(m20250715_000001_add_command_log_table::Migration),
            Box::new(m20250723_000001_add_training_run_table::Migration),
            Box::new(m20250724_000001_add_unique_nickname_index_to_owned_robot::Migration),
            Box::new(m20250725_000001_add_robot_type_to_robot::Migration),
            Box::new(m20250726_000001_add_command_log_foreign_key_indexes::Migration),
            Box::new(m20250109_000001_drop_cart_item_table::Migration),
            Box::new(m20250727_000001_add_owned_robot_indexes::Migration),
            Box::new(m20260219_000001_drop_owned_robot_profile_id::Migration),
            Box::new(m20260219_000002_add_ai_model_table::Migration),
            Box::new(m20260220_000001_add_ai_model_metadata::Migration),
        ]
    }
}
