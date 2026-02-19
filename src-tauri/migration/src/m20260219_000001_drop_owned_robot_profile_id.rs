use sea_orm::Statement;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite does not support dropping columns; rebuild owned_robot without profile_id.
        let db = manager.get_connection();

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "PRAGMA foreign_keys=OFF;".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE TABLE IF NOT EXISTS owned_robot_new (
                id TEXT NOT NULL PRIMARY KEY,
                robot_id TEXT NOT NULL,
                nickname TEXT,
                registration_date TIMESTAMP WITH TIME ZONE NOT NULL,
                confirmation_date TIMESTAMP WITH TIME ZONE NOT NULL,
                last_active_date TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                FOREIGN KEY(robot_id) REFERENCES robot(id) ON DELETE CASCADE
            );
            "#.to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            INSERT INTO owned_robot_new (
                id,
                robot_id,
                nickname,
                registration_date,
                confirmation_date,
                last_active_date,
                created_at,
                updated_at,
                deleted_at
            )
            SELECT
                id,
                robot_id,
                nickname,
                registration_date,
                confirmation_date,
                last_active_date,
                created_at,
                updated_at,
                deleted_at
            FROM owned_robot;
            "#.to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "DROP TABLE owned_robot;".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "ALTER TABLE owned_robot_new RENAME TO owned_robot;".to_string(),
        ))
        .await?;

        // Recreate indexes (profile-related indexes are intentionally omitted).
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_owned_robot_nickname_unique ON owned_robot (nickname);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_robot_id ON owned_robot (robot_id);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_last_active_date ON owned_robot (last_active_date);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_registration_date ON owned_robot (registration_date);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_created_at ON owned_robot (created_at);".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "PRAGMA foreign_keys=ON;".to_string(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Restore profile_id column by rebuilding owned_robot and seeding a local profile row.
        let db = manager.get_connection();

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "PRAGMA foreign_keys=OFF;".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            INSERT OR IGNORE INTO profile (id, handle)
            VALUES ('local-profile', 'local');
            "#.to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            CREATE TABLE IF NOT EXISTS owned_robot_new (
                id TEXT NOT NULL PRIMARY KEY,
                profile_id TEXT NOT NULL,
                robot_id TEXT NOT NULL,
                nickname TEXT,
                registration_date TIMESTAMP WITH TIME ZONE NOT NULL,
                confirmation_date TIMESTAMP WITH TIME ZONE NOT NULL,
                last_active_date TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                FOREIGN KEY(profile_id) REFERENCES profile(id) ON DELETE CASCADE,
                FOREIGN KEY(robot_id) REFERENCES robot(id) ON DELETE CASCADE
            );
            "#.to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            r#"
            INSERT INTO owned_robot_new (
                id,
                profile_id,
                robot_id,
                nickname,
                registration_date,
                confirmation_date,
                last_active_date,
                created_at,
                updated_at,
                deleted_at
            )
            SELECT
                id,
                'local-profile',
                robot_id,
                nickname,
                registration_date,
                confirmation_date,
                last_active_date,
                created_at,
                updated_at,
                deleted_at
            FROM owned_robot;
            "#.to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "DROP TABLE owned_robot;".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "ALTER TABLE owned_robot_new RENAME TO owned_robot;".to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_owned_robot_nickname_unique ON owned_robot (nickname);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_profile_id ON owned_robot (profile_id);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_robot_id ON owned_robot (robot_id);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_last_active_date ON owned_robot (last_active_date);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_registration_date ON owned_robot (registration_date);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_created_at ON owned_robot (created_at);".to_string(),
        ))
        .await?;
        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "CREATE INDEX IF NOT EXISTS idx_owned_robot_profile_id_last_active_date ON owned_robot (profile_id, last_active_date);"
                .to_string(),
        ))
        .await?;

        db.execute(Statement::from_string(
            manager.get_database_backend(),
            "PRAGMA foreign_keys=ON;".to_string(),
        ))
        .await?;

        Ok(())
    }
}
