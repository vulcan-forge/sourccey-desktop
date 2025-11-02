use crate::modules::robot::models::robot::{Entity as RobotEntity, Robot, RobotColumn};
use sea_orm::*;

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
}
