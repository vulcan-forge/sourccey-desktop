use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create training_run table
        manager
            .create_table(
                Table::create()
                    .table(TrainingRun::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(TrainingRun::Id).string().not_null().primary_key())
                    // Basic Training Information
                    .col(ColumnDef::new(TrainingRun::Name).string())
                    .col(ColumnDef::new(TrainingRun::Description).text())
                    .col(ColumnDef::new(TrainingRun::ModelName).string())
                    .col(ColumnDef::new(TrainingRun::DatasetName).string())
                    .col(ColumnDef::new(TrainingRun::TrainingConfig).text())
                    // Training Status and Progress
                    .col(ColumnDef::new(TrainingRun::Status).string().not_null())
                    .col(ColumnDef::new(TrainingRun::CurrentStep).big_integer())
                    .col(ColumnDef::new(TrainingRun::TotalSteps).big_integer())
                    .col(ColumnDef::new(TrainingRun::CurrentEpoch).integer())
                    .col(ColumnDef::new(TrainingRun::TotalEpochs).integer())
                    .col(ColumnDef::new(TrainingRun::ProgressPercentage).double())
                    // Training Metrics
                    .col(ColumnDef::new(TrainingRun::Loss).double())
                    .col(ColumnDef::new(TrainingRun::Accuracy).double())
                    .col(ColumnDef::new(TrainingRun::LearningRate).double())
                    .col(ColumnDef::new(TrainingRun::ValidationLoss).double())
                    .col(ColumnDef::new(TrainingRun::ValidationAccuracy).double())
                    // Training Configuration
                    .col(ColumnDef::new(TrainingRun::BatchSize).integer())
                    .col(ColumnDef::new(TrainingRun::NumWorkers).integer())
                    .col(ColumnDef::new(TrainingRun::Seed).integer())
                    .col(ColumnDef::new(TrainingRun::OutputDir).string())
                    .col(ColumnDef::new(TrainingRun::CheckpointPath).string())
                    .col(ColumnDef::new(TrainingRun::LogDir).string())
                    // GPU Information
                    .col(ColumnDef::new(TrainingRun::GpuCount).integer())
                    .col(ColumnDef::new(TrainingRun::GpuModels).text())
                    .col(ColumnDef::new(TrainingRun::GpuMemoryUsed).big_integer())
                    .col(ColumnDef::new(TrainingRun::GpuUtilization).double())
                    .col(ColumnDef::new(TrainingRun::MultiGpu).boolean())
                    // System Information
                    .col(ColumnDef::new(TrainingRun::CpuCount).integer())
                    .col(ColumnDef::new(TrainingRun::MemoryUsed).big_integer())
                    .col(ColumnDef::new(TrainingRun::SystemInfo).text())
                    // Execution Information
                    .col(ColumnDef::new(TrainingRun::StartedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(TrainingRun::CompletedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(TrainingRun::DurationSeconds).big_integer())
                    .col(ColumnDef::new(TrainingRun::ExitCode).integer())
                    .col(ColumnDef::new(TrainingRun::ErrorMessage).text())
                    .col(ColumnDef::new(TrainingRun::OutputLog).text())
                    // Performance Metrics
                    .col(ColumnDef::new(TrainingRun::SamplesPerSecond).double())
                    .col(ColumnDef::new(TrainingRun::StepsPerSecond).double())
                    .col(ColumnDef::new(TrainingRun::Throughput).double())
                    // Relationships
                    .col(ColumnDef::new(TrainingRun::ProfileId).string())
                    .col(ColumnDef::new(TrainingRun::RobotId).string())
                    .col(ColumnDef::new(TrainingRun::OwnedRobotId).string())
                    // External Integration
                    .col(ColumnDef::new(TrainingRun::WandbRunId).string())
                    .col(ColumnDef::new(TrainingRun::WandbProject).string())
                    .col(ColumnDef::new(TrainingRun::MlflowRunId).string())
                    .col(ColumnDef::new(TrainingRun::TensorboardUrl).string())
                    // Timestamps
                    .col(ColumnDef::new(TrainingRun::CreatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(TrainingRun::UpdatedAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(TrainingRun::DeletedAt).timestamp_with_time_zone())
                    // Foreign Keys
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_training_run_profile")
                            .from(TrainingRun::Table, TrainingRun::ProfileId)
                            .to(Profile::Table, Profile::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_training_run_robot")
                            .from(TrainingRun::Table, TrainingRun::RobotId)
                            .to(Robot::Table, Robot::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_training_run_owned_robot")
                            .from(TrainingRun::Table, TrainingRun::OwnedRobotId)
                            .to(OwnedRobot::Table, OwnedRobot::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                    )
                    .to_owned(),
            )
            .await?;

        // Create indexes for better query performance
        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_status")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::Status)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_profile_id")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::ProfileId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_robot_id")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::RobotId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_owned_robot_id")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::OwnedRobotId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_created_at")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_started_at")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::StartedAt)
                    .to_owned(),
            )
            .await?;

        // Composite index for status and created_at for efficient filtering
        manager
            .create_index(
                Index::create()
                    .name("idx_training_run_status_created_at")
                    .table(TrainingRun::Table)
                    .col(TrainingRun::Status)
                    .col(TrainingRun::CreatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop indexes first
        manager
            .drop_index(Index::drop().name("idx_training_run_status_created_at").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_started_at").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_created_at").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_owned_robot_id").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_robot_id").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_profile_id").to_owned())
            .await?;

        manager
            .drop_index(Index::drop().name("idx_training_run_status").to_owned())
            .await?;

        // Drop training_run table
        manager
            .drop_table(Table::drop().table(TrainingRun::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum TrainingRun {
    Table,
    Id,
    Name,
    Description,
    ModelName,
    DatasetName,
    TrainingConfig,
    Status,
    CurrentStep,
    TotalSteps,
    CurrentEpoch,
    TotalEpochs,
    ProgressPercentage,
    Loss,
    Accuracy,
    LearningRate,
    ValidationLoss,
    ValidationAccuracy,
    BatchSize,
    NumWorkers,
    Seed,
    OutputDir,
    CheckpointPath,
    LogDir,
    GpuCount,
    GpuModels,
    GpuMemoryUsed,
    GpuUtilization,
    MultiGpu,
    CpuCount,
    MemoryUsed,
    SystemInfo,
    StartedAt,
    CompletedAt,
    DurationSeconds,
    ExitCode,
    ErrorMessage,
    OutputLog,
    SamplesPerSecond,
    StepsPerSecond,
    Throughput,
    ProfileId,
    RobotId,
    OwnedRobotId,
    WandbRunId,
    WandbProject,
    MlflowRunId,
    TensorboardUrl,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Profile {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Robot {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum OwnedRobot {
    Table,
    Id,
}
