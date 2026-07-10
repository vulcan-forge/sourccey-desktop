#![allow(dead_code)]

use crate::modules::control::services::configuration::calibration_service::CalibrationService;
use crate::modules::control::services::configuration::configuration_service::ConfigurationService;
use crate::modules::robot::models::owned_robot::{
    ActiveOwnedRobot, Entity as OwnedRobotEntity, OwnedRobot, OwnedRobotColumn,
    OwnedRobotWithRelations,
};
use crate::modules::robot::models::robot::Entity as RobotEntity;
use sea_orm::*;

pub struct OwnedRobotService {
    connection: DatabaseConnection,
}

impl OwnedRobotService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    //----------------------------------------------------------//
    // GET Robot Functions
    //----------------------------------------------------------//
    pub async fn get_owned_robot_by_id(
        &self,
        id: String,
    ) -> Result<Option<OwnedRobotWithRelations>, DbErr> {
        let results = OwnedRobotEntity::find()
            .filter(OwnedRobotColumn::Id.eq(id))
            .filter(OwnedRobotColumn::DeletedAt.is_null())
            .find_with_related(RobotEntity)
            .all(&self.connection)
            .await?;

        let owned_robot_with_relations = results.first().map(|(owned_robot, robot_vec)| {
            let robot = robot_vec.first().cloned();
            OwnedRobotWithRelations {
                owned_robot: owned_robot.clone(),
                robot,
            }
        });

        Ok(owned_robot_with_relations)
    }

    pub async fn get_owned_robot_by_nickname(
        &self,
        nickname: String,
    ) -> Result<Option<OwnedRobotWithRelations>, DbErr> {
        let results = OwnedRobotEntity::find()
            .filter(OwnedRobotColumn::Nickname.eq(nickname))
            .filter(OwnedRobotColumn::DeletedAt.is_null())
            .find_with_related(RobotEntity)
            .all(&self.connection)
            .await?;

        let owned_robot_with_relations = results.first().map(|(owned_robot, robot_vec)| {
            let robot = robot_vec.first().cloned();
            OwnedRobotWithRelations {
                owned_robot: owned_robot.clone(),
                robot,
            }
        });

        Ok(owned_robot_with_relations)
    }

    pub async fn get_owned_robots(&self) -> Result<Vec<OwnedRobotWithRelations>, DbErr> {
        let results = OwnedRobotEntity::find()
            .filter(OwnedRobotColumn::DeletedAt.is_null())
            .find_with_related(RobotEntity)
            .all(&self.connection)
            .await?;

        let owned_robots_with_relations = results
            .into_iter()
            .map(|(owned_robot, robot_vec)| {
                let robot = robot_vec.first().cloned();
                OwnedRobotWithRelations { owned_robot, robot }
            })
            .collect();

        Ok(owned_robots_with_relations)
    }

    //----------------------------------------------------------//
    // CREATE Robot Functions
    //----------------------------------------------------------//
    pub async fn add_owned_robot(
        &self,
        owned_robot: ActiveOwnedRobot,
    ) -> Result<OwnedRobot, DbErr> {
        owned_robot.insert(&self.connection).await
    }

    pub async fn update_owned_robot_nickname(
        &self,
        id: String,
        nickname: String,
    ) -> Result<OwnedRobot, String> {
        let owned_robot = OwnedRobotEntity::find_by_id(id.clone())
            .one(&self.connection)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Owned robot not found for id {}", id))?;

        let old_nickname = owned_robot.nickname.clone().unwrap_or_default();
        let trimmed_nickname = nickname.trim().to_string();
        if trimmed_nickname.is_empty() {
            return Err("Nickname cannot be empty".to_string());
        }

        if !old_nickname.is_empty() && old_nickname != trimmed_nickname {
            ConfigurationService::rename_robot_cache_dir(&old_nickname, &trimmed_nickname)?;
            CalibrationService::rename_nickname_references(&old_nickname, &trimmed_nickname)?;
        }

        let mut active_model: ActiveOwnedRobot = owned_robot.into();
        active_model.nickname = Set(Some(trimmed_nickname));
        active_model.updated_at = Set(Some(chrono::Utc::now()));
        active_model
            .update(&self.connection)
            .await
            .map_err(|e| e.to_string())
    }

    //----------------------------------------------------------//
    // DELETE Robot Functions
    //----------------------------------------------------------//
    pub async fn delete_owned_robot(&self, id: String) -> Result<(), DbErr> {
        OwnedRobotEntity::delete_by_id(id)
            .exec(&self.connection)
            .await?;
        Ok(())
    }
}
