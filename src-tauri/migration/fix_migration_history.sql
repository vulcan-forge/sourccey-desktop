-- Remove the problematic migration records from the database
-- This will allow us to run migrations cleanly

DELETE FROM seaql_migrations 
WHERE version IN (
    'm20240909_000001_add_store_item_from_example',
    'm20250101_000001_add_cart_item_table'
);
