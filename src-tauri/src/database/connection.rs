use migration::MigratorTrait;
use sea_orm::*;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub struct DatabaseManager {
    connection: DatabaseConnection,
}

#[allow(dead_code)]
impl DatabaseManager {
    pub async fn new(app_handle: &AppHandle) -> Result<Self, DbErr> {
        // Now we can use path() method
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

        let db_path = app_dir.join("vulcan-studio.db");
        let database_url = format!("sqlite://{}?mode=rwc", db_path.display());

        let connection = Database::connect(&database_url).await?;

        // Run migrations
        Self::run_migrations(&connection).await?;
        Self::ensure_installation_identity(&connection).await?;

        Ok(Self { connection })
    }

    pub fn get_connection(&self) -> &DatabaseConnection {
        &self.connection
    }

    async fn run_migrations(connection: &DatabaseConnection) -> Result<(), DbErr> {
        // Run all migrations automatically
        migration::Migrator::up(connection, None).await?;
        Ok(())
    }

    async fn ensure_installation_identity(connection: &DatabaseConnection) -> Result<(), DbErr> {
        let now = chrono::Utc::now();
        connection
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT OR IGNORE INTO installation_identity \
                 (singleton_key, installation_id, customer_id, created_at, updated_at) \
                 VALUES (1, ?, NULL, ?, ?)",
                [
                    Uuid::now_v7().to_string().into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn close(self) -> Result<(), DbErr> {
        self.connection.close().await
    }
}
