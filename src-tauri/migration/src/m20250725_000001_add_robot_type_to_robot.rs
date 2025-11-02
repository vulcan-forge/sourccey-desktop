use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add robot_type column to robot table
        manager
            .alter_table(
                Table::alter()
                    .table(Robot::Table)
                    .add_column(ColumnDef::new(Robot::RobotType).string())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Remove robot_type column from robot table
        manager
            .alter_table(
                Table::alter()
                    .table(Robot::Table)
                    .drop_column(Robot::RobotType)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Robot {
    Table,
    RobotType,
}
