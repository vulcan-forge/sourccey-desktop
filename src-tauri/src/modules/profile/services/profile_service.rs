#![allow(dead_code)]

use crate::database::traits::BaseActiveModel;
use crate::modules::profile::models::profile::{
    ActiveProfile, Entity as ProfileEntity, Profile, ProfileColumn,
};
use sea_orm::*;

pub struct ProfileService {
    connection: DatabaseConnection,
}

impl ProfileService {
    pub fn new(connection: DatabaseConnection) -> Self {
        Self { connection }
    }

    pub async fn get_profile_by_id(&self, id: String) -> Result<Option<Profile>, DbErr> {
        ProfileEntity::find_by_id(id)
            .filter(ProfileColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    pub async fn get_profile_by_handle(&self, handle: String) -> Result<Option<Profile>, DbErr> {
        ProfileEntity::find()
            .filter(ProfileColumn::Handle.eq(handle))
            .filter(ProfileColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await
    }

    pub async fn get_first_profile(&self) -> Result<Option<Profile>, DbErr> {
        ProfileEntity::find()
            .filter(ProfileColumn::DeletedAt.is_null())
            .order_by(ProfileColumn::CreatedAt, Order::Asc)
            .one(&self.connection)
            .await
    }

    pub async fn create_profile(&self, profile_data: ActiveProfile) -> Result<Profile, DbErr> {
        profile_data.insert(&self.connection).await
    }

    pub async fn update_profile(
        &self,
        _id: String,
        mut profile_data: ActiveProfile,
    ) -> Result<Option<Profile>, DbErr> {
        // Update the timestamp
        profile_data.update_timestamp();

        // Extract all the values BEFORE calling update()
        let id = profile_data.id.take().unwrap();
        let account_id = profile_data.account_id.take().unwrap();
        let handle = profile_data.handle.take().unwrap();
        let name = profile_data.name.take().unwrap();
        let image = profile_data.image.take().unwrap();
        let bio = profile_data.bio.take().unwrap();
        let created_at = profile_data.created_at.take().unwrap();
        let updated_at = profile_data.updated_at.take().unwrap();
        let deleted_at = profile_data.deleted_at.take().unwrap();

        // Now call update() - this will consume profile_data
        profile_data.update(&self.connection).await.map(|_| {
            // Return the updated profile using the extracted values
            Some(Profile {
                id,
                account_id,
                handle,
                name,
                image,
                bio,
                created_at,
                updated_at,
                deleted_at,
            })
        })
    }

    pub async fn delete_profile(&self, id: String) -> Result<bool, DbErr> {
        let profile = ProfileEntity::find_by_id(id.clone())
            .filter(ProfileColumn::DeletedAt.is_null())
            .one(&self.connection)
            .await?;

        if let Some(profile) = profile {
            let mut active_profile: ActiveProfile = profile.into();
            active_profile.soft_delete();
            active_profile.update(&self.connection).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn get_all_profiles(&self) -> Result<Vec<Profile>, DbErr> {
        ProfileEntity::find()
            .filter(ProfileColumn::DeletedAt.is_null())
            .all(&self.connection)
            .await
    }
}
