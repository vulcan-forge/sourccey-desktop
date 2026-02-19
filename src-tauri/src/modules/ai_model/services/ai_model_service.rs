use crate::modules::ai_model::models::ai_model::{
    AiModel, AiModelColumn, ActiveModel as AiModelActiveModel, Entity as AiModelEntity,
};
use crate::utils::pagination::{PaginatedResponse, PaginationParameters};
use sea_orm::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelFilters {}

pub struct AiModelService {
    connection: DatabaseConnection,
}

impl AiModelService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    //-------------------------------------------------------------------------//
    // Get AI Model by ID
    //-------------------------------------------------------------------------//
    pub async fn get_ai_model(&self, id: String) -> Result<Option<AiModel>, DbErr> {
        AiModelEntity::find_by_id(id)
            .filter(AiModelColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    //-------------------------------------------------------------------------//
    // Create AI Model
    //-------------------------------------------------------------------------//
    pub async fn add_ai_model(&self, model: AiModelActiveModel) -> Result<AiModel, DbErr> {
        model.insert(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Update AI Model
    //-------------------------------------------------------------------------//
    pub async fn update_ai_model(&self, model: AiModelActiveModel) -> Result<AiModel, DbErr> {
        model.update(&self.connection).await
    }

    //-------------------------------------------------------------------------//
    // Delete AI Model (Soft Delete)
    //-------------------------------------------------------------------------//
    pub async fn delete_ai_model(&self, id: String) -> Result<(), DbErr> {
        let model = AiModelEntity::find_by_id(id)
            .one(&self.connection)
            .await?;

        if let Some(model) = model {
            let mut active: AiModelActiveModel = model.into();
            active.deleted_at = Set(Some(chrono::Utc::now()));
            active.update(&self.connection).await?;
        }

        Ok(())
    }

    //-------------------------------------------------------------------------//
    // Get AI Models Paginated
    //-------------------------------------------------------------------------//
    pub async fn get_ai_models_paginated(
        &self,
        _filters: AiModelFilters,
        pagination: PaginationParameters,
    ) -> Result<PaginatedResponse<AiModel>, DbErr> {
        let page = pagination.page.unwrap_or(1);
        let page_size = pagination.page_size.unwrap_or(20);
        let offset = (page - 1) * page_size;

        let query = AiModelEntity::find().filter(AiModelColumn::DeletedAt.is_null());

        let total = query.clone().count(&self.connection).await? as usize;
        let data = query
            .order_by_desc(AiModelColumn::CreatedAt)
            .offset(offset as u64)
            .limit(page_size as u64)
            .all(&self.connection)
            .await?;

        let total_pages = if page_size == 0 { 0 } else { (total + page_size - 1) / page_size };

        Ok(PaginatedResponse {
            data,
            total,
            page,
            page_size,
            total_pages,
            has_next: page < total_pages,
            has_previous: page > 1,
        })
    }
}
