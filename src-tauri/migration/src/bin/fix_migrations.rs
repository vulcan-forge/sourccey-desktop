use sea_orm_migration::prelude::*;
use migration::Migrator;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tokio::runtime::Runtime::new()?.block_on(async {
        // Connect to the database
        let database_url = "sqlite://C:/Users/Nicholas/AppData/Roaming/Sourccey/sourccey.db?mode=rwc";
        let db = Database::connect(database_url).await?;

        // Remove the problematic migration records
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            "DELETE FROM seaql_migrations WHERE version IN (?, ?)",
            vec![
                "m20240909_000001_add_store_item_from_example".into(),
                "m20250101_000001_add_cart_item_table".into(),
            ],
        );

        let result = db.execute(stmt).await?;
        println!("Removed {} migration records", result.rows_affected);

        // Now run the migrations
        println!("Running migrations...");
        Migrator::up(&db, None).await?;
        println!("Migrations completed successfully!");

        Ok(())
    })
}
