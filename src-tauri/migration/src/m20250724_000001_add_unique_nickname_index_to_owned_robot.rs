use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create unique index on nickname column
        manager
            .create_index(
                Index::create()
                    .name("idx_owned_robot_nickname_unique")
                    .table(OwnedRobot::Table)
                    .col(OwnedRobot::Nickname)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop the unique index
        manager
            .drop_index(
                Index::drop()
                    .name("idx_owned_robot_nickname_unique")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum OwnedRobot {
    Table,
    Nickname,
}
