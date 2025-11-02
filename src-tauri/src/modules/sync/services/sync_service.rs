use crate::modules::robot::models::robot::{
    ActiveRobot, Entity as RobotEntity, Robot, RobotColumn,
};
use crate::modules::sync::models::sync_metadata::{
    ActiveSyncMetadata, Entity as SyncMetadataEntity, SyncMetadata, SyncMetadataColumn,
};
use chrono::{DateTime, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub synced_records: i32,
    pub error: Option<String>,
    pub details: SyncDetails,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncDetails {
    pub robots_synced: i32,
    pub last_sync_at: DateTime<Utc>,
}

// Type alias for cloud robots - same structure as Robot but from cloud source
pub type CloudRobot = Robot;

pub struct SyncService {
    connection: DatabaseConnection,
}

impl SyncService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    pub async fn sync_robots(&self, cloud_robots: Vec<CloudRobot>) -> Result<SyncResult, String> {
        let mut robots_synced = 0;
        let current_time = Utc::now();

        // Get last sync timestamp
        let last_sync = self.get_last_sync_timestamp().await?;

        // Process each cloud robot
        for cloud_robot in cloud_robots {
            match self.sync_single_robot(&cloud_robot, last_sync).await {
                Ok(_) => robots_synced += 1,
                Err(e) => println!("Failed to sync robot {}: {}", cloud_robot.id, e),
            }
        }

        // Update sync metadata
        self.update_sync_metadata(robots_synced, None).await?;

        Ok(SyncResult {
            success: true,
            synced_records: robots_synced,
            error: None,
            details: SyncDetails {
                robots_synced,
                last_sync_at: current_time,
            },
        })
    }

    async fn sync_single_robot(
        &self,
        cloud_robot: &CloudRobot,
        _last_sync: Option<DateTime<Utc>>,
    ) -> Result<(), String> {
        // Check if robot exists locally
        let existing_robot = RobotEntity::find_by_id(&cloud_robot.id)
            .one(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        match existing_robot {
            Some(local_robot) => {
                // Robot exists - check if cloud version is newer
                if let Some(cloud_updated_at) = cloud_robot.updated_at {
                    if let Some(local_updated_at) = local_robot.updated_at {
                        if cloud_updated_at > local_updated_at {
                            // Cloud version is newer - update local
                            self.update_local_robot(&cloud_robot).await?;
                        }
                    } else {
                        // Local has no updated_at - update with cloud version
                        self.update_local_robot(&cloud_robot).await?;
                    }
                }
            }
            None => {
                // Robot doesn't exist locally - create it
                self.create_local_robot(&cloud_robot).await?;
            }
        }

        Ok(())
    }

    async fn create_local_robot(&self, cloud_robot: &CloudRobot) -> Result<(), String> {
        // Convert CloudRobot to ActiveRobot and insert
        let active_robot = ActiveRobot::new()
            .with_name(cloud_robot.name.clone().unwrap_or_default())
            .with_description(cloud_robot.description.clone().unwrap_or_default())
            .with_github_url(cloud_robot.github_url.clone().unwrap_or_default());

        // Set the ID from cloud robot
        let mut active_robot = active_robot;
        active_robot.id = Set(cloud_robot.id.clone());

        // Set other fields
        active_robot.long_name = Set(cloud_robot.long_name.clone());
        active_robot.short_description = Set(cloud_robot.short_description.clone());
        active_robot.image = Set(cloud_robot.image.clone());
        active_robot.robot_type = Set(cloud_robot.robot_type.clone());
        active_robot.created_at = Set(cloud_robot.created_at);
        active_robot.updated_at = Set(cloud_robot.updated_at);

        println!("Creating new robot: {}", cloud_robot.id);

        RobotEntity::insert(active_robot)
            .exec(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn update_local_robot(&self, cloud_robot: &CloudRobot) -> Result<(), String> {
        println!("Updating existing robot: {}", cloud_robot.id);

        // Update the robot in local database
        let update_result = RobotEntity::update_many()
            .col_expr(
                RobotColumn::Name,
                Expr::val(cloud_robot.name.clone()).into(),
            )
            .col_expr(
                RobotColumn::LongName,
                Expr::val(cloud_robot.long_name.clone()).into(),
            )
            .col_expr(
                RobotColumn::Description,
                Expr::val(cloud_robot.description.clone()).into(),
            )
            .col_expr(
                RobotColumn::ShortDescription,
                Expr::val(cloud_robot.short_description.clone()).into(),
            )
            .col_expr(
                RobotColumn::Image,
                Expr::val(cloud_robot.image.clone()).into(),
            )
            .col_expr(
                RobotColumn::GithubUrl,
                Expr::val(cloud_robot.github_url.clone()).into(),
            )
            .col_expr(
                RobotColumn::RobotType,
                Expr::val(cloud_robot.robot_type.clone()).into(),
            )
            .col_expr(RobotColumn::UpdatedAt, Expr::val(Some(Utc::now())).into())
            .filter(RobotColumn::Id.eq(cloud_robot.id.clone()))
            .exec(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        println!(
            "Updated {} rows for robot {}",
            update_result.rows_affected, cloud_robot.id
        );

        Ok(())
    }

    async fn get_last_sync_timestamp(&self) -> Result<Option<DateTime<Utc>>, String> {
        // Get the most recent sync metadata
        let sync_metadata = SyncMetadataEntity::find()
            .order_by_desc(SyncMetadataColumn::LastSyncAt)
            .one(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        Ok(sync_metadata.and_then(|sm| sm.last_sync_at))
    }

    async fn update_sync_metadata(
        &self,
        records_synced: i32,
        error: Option<String>,
    ) -> Result<(), String> {
        // Create or update sync metadata
        let active_metadata = if let Some(error) = error {
            ActiveSyncMetadata::new().update_sync_error(error)
        } else {
            ActiveSyncMetadata::new().update_sync_success(records_synced)
        };

        // Insert or update in database
        SyncMetadataEntity::insert(active_metadata)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(SyncMetadataColumn::Id)
                    .update_column(SyncMetadataColumn::LastSyncAt)
                    .update_column(SyncMetadataColumn::SyncStatus)
                    .update_column(SyncMetadataColumn::RecordsSynced)
                    .update_column(SyncMetadataColumn::Error)
                    .update_column(SyncMetadataColumn::UpdatedAt)
                    .to_owned(),
            )
            .exec(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn get_sync_status(&self) -> Result<Option<SyncMetadata>, String> {
        let sync_metadata = SyncMetadataEntity::find()
            .order_by_desc(SyncMetadataColumn::LastSyncAt)
            .one(&self.connection)
            .await
            .map_err(|e| e.to_string())?;

        Ok(sync_metadata)
    }
}
