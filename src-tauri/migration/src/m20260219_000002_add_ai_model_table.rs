use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(AiModel::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(AiModel::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(AiModel::Name).string().not_null())
                    .col(ColumnDef::new(AiModel::ModelPath).string().not_null())
                    .col(ColumnDef::new(AiModel::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(AiModel::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(AiModel::DeletedAt).timestamp_with_time_zone())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(AiModel::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum AiModel {
    Table,
    Id,
    Name,
    ModelPath,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
