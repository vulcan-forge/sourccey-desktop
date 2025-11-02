use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop the cart_item table
        manager
            .drop_table(
                Table::drop()
                    .table(CartItem::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Recreate the cart_item table if needed to rollback
        manager
            .create_table(
                Table::create()
                    .table(CartItem::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CartItem::Id)
                            .uuid()
                            .not_null()
                            .primary_key()
                            .extra("DEFAULT gen_random_uuid()".to_string()),
                    )
                    .col(ColumnDef::new(CartItem::AccountId).string().not_null())
                    .col(ColumnDef::new(CartItem::StoreItemId).uuid().not_null())
                    .col(ColumnDef::new(CartItem::Quantity).integer().not_null())
                    .col(ColumnDef::new(CartItem::Price).decimal().not_null())
                    .col(ColumnDef::new(CartItem::Currency).string().not_null())
                    .col(ColumnDef::new(CartItem::Status).string().not_null())
                    .col(ColumnDef::new(CartItem::TimePurchased).timestamp_with_time_zone())
                    .col(ColumnDef::new(CartItem::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(CartItem::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(CartItem::DeletedAt).timestamp_with_time_zone())
                    .index(
                        Index::create()
                            .name("idx_cart_item_account_id")
                            .col(CartItem::AccountId)
                    )
                    .index(
                        Index::create()
                            .name("idx_cart_item_store_item_id")
                            .col(CartItem::StoreItemId)
                    )
                    .index(
                        Index::create()
                            .name("idx_cart_item_account_store_status")
                            .col(CartItem::AccountId)
                            .col(CartItem::StoreItemId)
                            .col(CartItem::Status)
                    )
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum CartItem {
    Table,
    Id,
    AccountId,
    StoreItemId,
    Quantity,
    Price,
    Currency,
    Status,
    TimePurchased,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
