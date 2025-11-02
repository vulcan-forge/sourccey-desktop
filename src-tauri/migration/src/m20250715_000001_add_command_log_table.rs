use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create command_log table
        manager
            .create_table(
                Table::create()
                    .table(CommandLog::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(CommandLog::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(CommandLog::Command).string().not_null())
                    .col(ColumnDef::new(CommandLog::Description).string())
                    .col(ColumnDef::new(CommandLog::Status).string().not_null())
                    .col(ColumnDef::new(CommandLog::ExitCode).integer())
                    .col(ColumnDef::new(CommandLog::Output).text())
                    .col(ColumnDef::new(CommandLog::ErrorMessage).text())
                    .col(ColumnDef::new(CommandLog::RobotId).string())
                    .col(ColumnDef::new(CommandLog::OwnedRobotId).string())
                    .col(ColumnDef::new(CommandLog::ProfileId).string())
                    .col(ColumnDef::new(CommandLog::ExecutionTimeMs).big_integer())
                    .col(ColumnDef::new(CommandLog::StartedAt).timestamp_with_time_zone().not_null())
                    .col(ColumnDef::new(CommandLog::CompletedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(CommandLog::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(CommandLog::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(CommandLog::DeletedAt).timestamp_with_time_zone())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_command_log_robot")
                            .from(CommandLog::Table, CommandLog::RobotId)
                            .to(Robot::Table, Robot::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_command_log_owned_robot")
                            .from(CommandLog::Table, CommandLog::OwnedRobotId)
                            .to(OwnedRobot::Table, OwnedRobot::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_command_log_profile")
                            .from(CommandLog::Table, CommandLog::ProfileId)
                            .to(Profile::Table, Profile::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop command_log table
        manager
            .drop_table(Table::drop().table(CommandLog::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum CommandLog {
    Table,
    Id,
    Command,
    Description,
    Status,
    ExitCode,
    Output,
    ErrorMessage,
    RobotId,
    OwnedRobotId,
    ProfileId,
    ExecutionTimeMs,
    StartedAt,
    CompletedAt,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Robot {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum OwnedRobot {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Profile {
    Table,
    Id,
} 