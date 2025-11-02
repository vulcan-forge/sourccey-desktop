use sea_orm_migration::prelude::*;
use std::env;

#[async_std::main]
async fn main() {
    // Set the database URL if not already set
    if env::var("DATABASE_URL").is_err() {
        // Get the proper data directory for any user
        let data_dir = dirs::data_dir()
            .expect("Failed to get data directory")
            .join("Sourccey");

        // Ensure the directory exists
        std::fs::create_dir_all(&data_dir).expect("Failed to create Sourccey directory");

        let db_path = format!("sqlite://{}/sourccey.db?mode=rwc",
            data_dir.to_string_lossy().replace('\\', "/"));

        env::set_var("DATABASE_URL", db_path);
    }

    cli::run_cli(migration::Migrator).await;
}
