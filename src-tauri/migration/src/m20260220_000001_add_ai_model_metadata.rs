use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(AiModel::Table)
                    .add_column(ColumnDef::new(AiModel::ModelPathRelative).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(AiModel::Table)
                    .add_column(ColumnDef::new(AiModel::LatestCheckpoint).big_integer())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(AiModel::Table)
                    .drop_column(AiModel::ModelPathRelative)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(AiModel::Table)
                    .drop_column(AiModel::LatestCheckpoint)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum AiModel {
    Table,
    ModelPathRelative,
    LatestCheckpoint,
}
