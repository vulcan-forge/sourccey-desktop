#![allow(dead_code)]

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

    pub async fn get_owned_robots_by_profile(
        &self,
        profile_id: String,
    ) -> Result<Vec<OwnedRobotWithRelations>, DbErr> {
        let results = OwnedRobotEntity::find()
            .filter(OwnedRobotColumn::ProfileId.eq(profile_id))
            .filter(OwnedRobotColumn::DeletedAt.is_null())
            .find_with_related(RobotEntity)
            .all(&self.connection)
            .await?;

        // Transform to clean API structure
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
