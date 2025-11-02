use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add index on profile_id for faster JOINs with profile table
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_profile_id")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::ProfileId)
                    .to_owned(),
            )
            .await?;

        // Add index on robot_id for faster JOINs with robot table
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_robot_id")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::RobotId)
                    .to_owned(),
            )
            .await?;

        // Add index on last_active_date for filtering active robots
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_last_active_date")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::LastActiveDate)
                    .to_owned(),
            )
            .await?;

        // Add index on registration_date for sorting by registration time
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_registration_date")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::RegistrationDate)
                    .to_owned(),
            )
            .await?;

        // Add index on created_at for general ordering
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_created_at")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::CreatedAt)
                    .to_owned(),
            )
            .await?;

        // Add composite index for profile_id + last_active_date (common query pattern)
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_profile_id_last_active_date")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::ProfileId)
                    .col(OwnedRobot::LastActiveDate)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop all indexes in reverse order
        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_profile_id_last_active_date")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_created_at")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_registration_date")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_last_active_date")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_robot_id")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_profile_id")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum OwnedRobot {
    Table,
    ProfileId,
    RobotId,
    LastActiveDate,
    RegistrationDate,
    CreatedAt,
}
