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
