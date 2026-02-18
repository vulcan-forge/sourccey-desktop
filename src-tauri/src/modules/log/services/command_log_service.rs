use crate::modules::log::models::command_log::{
    ActiveModel as CommandLogActiveModel, CommandLog, CommandLogColumn, Entity as CommandLogEntity,
};
use crate::modules::robot::models::robot::{Entity as RobotEntity, Robot};
use crate::modules::robot::services::owned_robot_service::OwnedRobotService;
use crate::modules::robot::services::robot_service::RobotService;
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use chrono::{DateTime, Utc};
use sea_orm::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLogWithRobot {
    #[serde(flatten)]
    pub command_log: CommandLog,
    pub robot: Option<Robot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLogFilters {
    pub robot_id: Option<String>,
    pub owned_robot_id: Option<String>,
    pub status: Option<String>,
    pub command: Option<String>,
    pub started_after: Option<DateTime<Utc>>,
    pub started_before: Option<DateTime<Utc>>,
    pub completed_after: Option<DateTime<Utc>>,
    pub completed_before: Option<DateTime<Utc>>,
}

pub struct CommandLogService {
    connection: DatabaseConnection,
}

impl CommandLogService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    //-------------------------------------------------------------------------//
    // Get Command Log by ID
    //-------------------------------------------------------------------------//
    pub async fn get_command_log(&self, id: String) -> Result<Option<CommandLog>, DbErr> {
        CommandLog::get(&self.connection, id).await
    }

    //-------------------------------------------------------------------------//
    // Create Command Log
    //-------------------------------------------------------------------------//
    pub async fn add_command_log(
        &self,
        command_log: CommandLogActiveModel,
    ) -> Result<CommandLog, DbErr> {
        command_log.insert(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Update Command Log
    //-------------------------------------------------------------------------//
    pub async fn update_command_log(
        &self,
        command_log: CommandLogActiveModel,
    ) -> Result<CommandLog, DbErr> {
        command_log.update(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Delete Command Log (Soft Delete)
    //-------------------------------------------------------------------------//
    pub async fn delete_command_log(&self, id: String) -> Result<(), DbErr> {
        CommandLogEntity::delete_by_id(id)
            .exec(&self.connection)
            .await?;
        Ok(())
    }

    pub async fn delete_all_command_logs(&self) -> Result<(), DbErr> {
        CommandLogEntity::delete_many()
            .exec(&self.connection)
            .await?;
        Ok(())
    }

    //-------------------------------------------------------------------------//
    // Get Command Logs Paginated
    //-------------------------------------------------------------------------//
    pub async fn get_command_logs_paginated(
        &self,
        filters: CommandLogFilters,
        pagination: PaginationParameters,
    ) -> Result<PaginatedResponse<CommandLogWithRobot>, DbErr> {
        let page = pagination.page.unwrap_or(1);
        let page_size = pagination.page_size.unwrap_or(20);
        let offset = (page - 1) * page_size;

        // Build the query with filters and join with robot
        let mut query = CommandLogEntity::find()
            .find_also_related(RobotEntity)
            .filter(CommandLogColumn::DeletedAt.is_null());

        // Apply filters
        if let Some(robot_id) = filters.robot_id {
            query = query.filter(CommandLogColumn::RobotId.eq(robot_id));
        }
        if let Some(owned_robot_id) = filters.owned_robot_id {
            query = query.filter(CommandLogColumn::OwnedRobotId.eq(owned_robot_id));
        }
        if let Some(status) = filters.status {
            query = query.filter(CommandLogColumn::Status.eq(status));
        }
        if let Some(command) = filters.command {
            query = query.filter(CommandLogColumn::Command.contains(command));
        }
        if let Some(started_after) = filters.started_after {
            query = query.filter(CommandLogColumn::StartedAt.gte(started_after));
        }
        if let Some(started_before) = filters.started_before {
            query = query.filter(CommandLogColumn::StartedAt.lte(started_before));
        }
        if let Some(completed_after) = filters.completed_after {
            query = query.filter(CommandLogColumn::CompletedAt.gte(completed_after));
        }
        if let Some(completed_before) = filters.completed_before {
            query = query.filter(CommandLogColumn::CompletedAt.lte(completed_before));
        }

        // Order by started_at descending (most recent first)
        query = query.order_by_desc(CommandLogColumn::StartedAt);

        // Get total count for pagination metadata
        let total_u64 = query.clone().count(&self.connection).await?;
        let total = total_u64 as usize;

        // Apply pagination
        let command_logs_with_robots = query
            .offset(offset as u64)
            .limit(page_size as u64)
            .all(&self.connection)
            .await?;

        // Transform the results to include robot data
        let command_logs_with_robots: Vec<CommandLogWithRobot> = command_logs_with_robots
            .into_iter()
            .map(|(command_log, robot)| CommandLogWithRobot { command_log, robot })
            .collect();

        // Calculate pagination metadata
        let total_pages = (total + page_size - 1) / page_size; // Ceiling division
        let has_next = page < total_pages;
        let has_previous = page > 1;

        Ok(PaginatedResponse {
            data: command_logs_with_robots,
            total,
            page,
            page_size,
            total_pages,
            has_next,
            has_previous,
        })
    }

    //-------------------------------------------------------------------------//
    // Add Command Utility Functions
    //-------------------------------------------------------------------------//
    pub async fn add_robot_command_log(
        &self,
        command_log: &str,
        robot_type: Option<String>,
        nickname: Option<String>,
    ) -> Result<CommandLog, DbErr> {
        let robot_id = if let Some(robot_type) = robot_type {
            let robot_service = RobotService::new(self.connection.clone());
            let robot = robot_service.get_robot_by_type(robot_type).await?;
            robot.map(|r| r.id)
        } else {
            None
        };

        let owned_robot_id = if let Some(nickname) = nickname {
            let owned_robot_service = OwnedRobotService::new(self.connection.clone());
            let owned_robot = owned_robot_service
                .get_owned_robot_by_nickname(nickname)
                .await?;
            owned_robot.map(|r| r.owned_robot.id)
        } else {
            None
        };

        let mut command_log = CommandLogActiveModel::new()
            .with_command(command_log.to_string())
            .with_status("running".to_string());

        // Add robot ID if it exists
        if let Some(robot_id) = robot_id {
            command_log = command_log.with_robot_id(robot_id);
        }

        if let Some(owned_robot_id) = owned_robot_id {
            command_log = command_log.with_owned_robot_id(owned_robot_id);
        }

        let added_command_log = self.add_command_log(command_log).await?;
        Ok(added_command_log)
    }

    pub async fn update_robot_command_log(
        &self,
        id: String,
        status: String,
        exit_code: Option<i32>,
        error_message: Option<String>,
    ) -> Result<CommandLog, DbErr> {
        let existing_command_log = CommandLogEntity::find_by_id(id)
            .one(&self.connection)
            .await?;

        let existing_command_log = existing_command_log
            .ok_or(DbErr::RecordNotFound("Command log not found".to_string()))?;

        // Clone the started_at before moving the existing_command_log
        let started_at = existing_command_log.started_at;
        let mut command_log_active = existing_command_log.into_active_model();

        command_log_active.status = Set(status);
        command_log_active.exit_code = Set(exit_code);
        command_log_active.error_message = Set(error_message);
        command_log_active.completed_at = Set(Some(Utc::now()));
        command_log_active.execution_time_ms =
            Set(Some((Utc::now() - started_at).num_milliseconds()));
        command_log_active.updated_at = Set(Some(Utc::now()));

        let updated_command_log = command_log_active.update(&self.connection).await?;
        Ok(updated_command_log)
    }
}
