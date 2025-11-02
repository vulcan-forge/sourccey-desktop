use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add index on robot_id for faster JOINs
        manager
            .create_index(
                Index::create()
                    .name("idx_command_log_robot_id")
                    .table(CommandLog::Table)
                    .col(CommandLog::RobotId)
                    .to_owned(),
            )
            .await?;

        // Add index on owned_robot_id for faster JOINs
        manager
            .create_index(
                Index::create()
                    .name("idx_command_log_owned_robot_id")
                    .table(CommandLog::Table)
                    .col(CommandLog::OwnedRobotId)
                    .to_owned(),
            )
            .await?;

        // Add index on profile_id for faster JOINs
        manager
            .create_index(
                Index::create()
                    .name("idx_command_log_profile_id")
                    .table(CommandLog::Table)
                    .col(CommandLog::ProfileId)
                    .to_owned(),
            )
            .await?;

        // Add index on started_at for faster ordering (commonly used in queries)
        manager
            .create_index(
                Index::create()
                    .name("idx_command_log_started_at")
                    .table(CommandLog::Table)
                    .col(CommandLog::StartedAt)
                    .to_owned(),
            )
            .await?;

        // Add index on status for faster filtering (commonly used in queries)
        manager
            .create_index(
                Index::create()
                    .name("idx_command_log_status")
                    .table(CommandLog::Table)
                    .col(CommandLog::Status)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop all the indexes in reverse order
        manager
            .drop_index(
                Index::drop()
                    .name("idx_command_log_status")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_command_log_started_at")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_command_log_profile_id")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_command_log_owned_robot_id")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_command_log_robot_id")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum CommandLog {
    Table,
    RobotId,
    OwnedRobotId,
    ProfileId,
    StartedAt,
    Status,
}
