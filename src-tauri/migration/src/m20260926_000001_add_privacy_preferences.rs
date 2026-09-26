use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(PrivacyPreference::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PrivacyPreference::SingletonKey)
                            .integer()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::OnboardingCompleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::OnboardingVersion)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::PrivacyNoticeVersion)
                            .integer()
                            .not_null()
                            .default(1),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::DiagnosticsEnabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::DatasetMetadataEnabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::TrajectoryUploadEnabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(PrivacyPreference::CameraUploadEnabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(PrivacyPreference::DecidedAt).timestamp_with_time_zone())
                    .col(
                        ColumnDef::new(PrivacyPreference::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared(
                "INSERT OR IGNORE INTO privacy_preference \
                 (singleton_key, onboarding_completed, onboarding_version, privacy_notice_version, \
                  diagnostics_enabled, dataset_metadata_enabled, trajectory_upload_enabled, \
                  camera_upload_enabled, decided_at, updated_at) \
                 VALUES (1, 0, 0, 1, 0, 0, 0, 0, NULL, CURRENT_TIMESTAMP)",
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PrivacyPreference::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum PrivacyPreference {
    Table,
    SingletonKey,
    OnboardingCompleted,
    OnboardingVersion,
    PrivacyNoticeVersion,
    DiagnosticsEnabled,
    DatasetMetadataEnabled,
    TrajectoryUploadEnabled,
    CameraUploadEnabled,
    DecidedAt,
    UpdatedAt,
}
