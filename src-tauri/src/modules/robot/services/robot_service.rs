use crate::modules::robot::models::robot::{Entity as RobotEntity, Robot, RobotColumn};
use sea_orm::*;
use sea_orm::Set;
use crate::modules::robot::models::robot::ActiveRobot;

pub struct RobotService {
    connection: DatabaseConnection,
}

impl RobotService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    pub async fn get_robot_by_id(&self, id: String) -> Result<Option<Robot>, DbErr> {
        RobotEntity::find_by_id(id)
            .filter(RobotColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    pub async fn get_robot_by_type(&self, robot_type: String) -> Result<Option<Robot>, DbErr> {
        RobotEntity::find()
            .filter(RobotColumn::RobotType.eq(robot_type))
            .filter(RobotColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    pub async fn get_all_robots(&self) -> Result<Vec<Robot>, DbErr> {
        RobotEntity::find()
            .filter(RobotColumn::DeletedAt.is_null())
            .all(&self.connection)
            .await
    }

    pub async fn upsert_robot_template(
        &self,
        robot_type: Option<String>,
        robot_name: Option<String>,
    ) -> Result<Robot, DbErr> {
        let normalized_type = robot_type
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let normalized_name = robot_name
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if let Some(robot_type) = normalized_type.clone() {
            if let Some(existing) = RobotEntity::find()
                .filter(RobotColumn::RobotType.eq(robot_type))
                .filter(RobotColumn::DeletedAt.is_null())
                .one(&self.connection)
                .await?
            {
                return Ok(existing);
            }
        }

        if let Some(robot_name) = normalized_name.clone() {
            if let Some(existing) = RobotEntity::find()
                .filter(RobotColumn::Name.eq(robot_name))
                .filter(RobotColumn::DeletedAt.is_null())
                .one(&self.connection)
                .await?
            {
                return Ok(existing);
            }
        }

        let mut robot = ActiveRobot::new();
        if let Some(robot_name) = normalized_name {
            robot.name = Set(Some(robot_name));
        }
        if let Some(robot_type) = normalized_type {
            robot.robot_type = Set(Some(robot_type));
        }

        robot.insert(&self.connection).await
    }
}
