use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create profile table
        manager
            .create_table(
                Table::create()
                    .table(Profile::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Profile::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(Profile::AccountId).string())
                    .col(ColumnDef::new(Profile::Handle).string().not_null().unique_key())
                    .col(ColumnDef::new(Profile::Name).string())
                    .col(ColumnDef::new(Profile::Image).string())
                    .col(ColumnDef::new(Profile::Bio).string())
                    .col(ColumnDef::new(Profile::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Profile::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Profile::DeletedAt).timestamp_with_time_zone())
                    .to_owned(),
            )
            .await?;

        // Create robot table
        manager
            .create_table(
                Table::create()
                    .table(Robot::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Robot::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(Robot::Name).string())
                    .col(ColumnDef::new(Robot::LongName).string())
                    .col(ColumnDef::new(Robot::Description).string())
                    .col(ColumnDef::new(Robot::ShortDescription).string())
                    .col(ColumnDef::new(Robot::Image).string())
                    .col(ColumnDef::new(Robot::GithubUrl).string())
                    .col(ColumnDef::new(Robot::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Robot::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Robot::DeletedAt).timestamp_with_time_zone())
                    .to_owned(),
            )
            .await?;

        // Create owned_robot table
        manager
            .create_table(
                Table::create()
                    .table(OwnedRobot::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(OwnedRobot::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(OwnedRobot::ProfileId).string().not_null())
                    .col(ColumnDef::new(OwnedRobot::RobotId).string().not_null())
                    .col(ColumnDef::new(OwnedRobot::Nickname).string())
                    .col(ColumnDef::new(OwnedRobot::RegistrationDate).timestamp_with_time_zone().not_null())
                    .col(ColumnDef::new(OwnedRobot::ConfirmationDate).timestamp_with_time_zone().not_null())
                    .col(ColumnDef::new(OwnedRobot::LastActiveDate).timestamp_with_time_zone().not_null())
                    .col(ColumnDef::new(OwnedRobot::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(OwnedRobot::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(OwnedRobot::DeletedAt).timestamp_with_time_zone())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_owned_robot_profile")
                            .from(OwnedRobot::Table, OwnedRobot::ProfileId)
                            .to(Profile::Table, Profile::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_owned_robot_robot")
                            .from(OwnedRobot::Table, OwnedRobot::RobotId)
                            .to(Robot::Table, Robot::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                    )
                    .to_owned(),
            )
            .await?;

        // Create sync_metadata table
        manager
            .create_table(
                Table::create()
                    .table(SyncMetadata::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(SyncMetadata::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(SyncMetadata::LastSyncAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(SyncMetadata::SyncStatus).string())
                    .col(ColumnDef::new(SyncMetadata::RecordsSynced).integer())
                    .col(ColumnDef::new(SyncMetadata::Error).string())
                    .col(ColumnDef::new(SyncMetadata::DeviceId).string())
                    .col(ColumnDef::new(SyncMetadata::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(SyncMetadata::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(SyncMetadata::DeletedAt).timestamp_with_time_zone())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop tables in reverse order due to foreign key constraints
        manager
            .drop_table(Table::drop().table(SyncMetadata::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(OwnedRobot::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Robot::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Profile::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Profile {
    Table,
    Id,
    AccountId,
    Handle,
    Name,
    Image,
    Bio,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Robot {
    Table,
    Id,
    Name,
    LongName,
    Description,
    ShortDescription,
    Image,
    GithubUrl,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum OwnedRobot {
    Table,
    Id,
    ProfileId,
    RobotId,
    Nickname,
    RegistrationDate,
    ConfirmationDate,
    LastActiveDate,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum SyncMetadata {
    Table,
    Id,
    LastSyncAt,
    SyncStatus,
    RecordsSynced,
    Error,
    DeviceId,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
