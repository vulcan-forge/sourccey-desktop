#![allow(dead_code)]

use crate::modules::profile::models::profile::{ActiveProfile, Profile};
use crate::modules::profile::services::profile_service::ProfileService;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProfileRequest {
    pub account_id: Option<String>,
    pub handle: String,
    pub name: Option<String>,
    pub image: Option<String>,
    pub bio: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub image: Option<String>,
    pub bio: Option<String>,
}

#[tauri::command]
pub async fn get_profile_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<Option<Profile>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    profile_service
        .get_profile_by_id(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_first_profile(app_handle: AppHandle) -> Result<Option<Profile>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    profile_service
        .get_first_profile()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_profiles(app_handle: AppHandle) -> Result<Vec<Profile>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    profile_service
        .get_all_profiles()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_profile(
    app_handle: AppHandle,
    request: CreateProfileRequest,
) -> Result<Profile, String> {
    println!("create_profile called with request: {:?}", request);

    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    println!("Database manager retrieved successfully");
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    // Check if handle already exists
    println!("Checking if handle already exists");
    if let Some(_existing_profile) = profile_service
        .get_profile_by_handle(request.handle.clone())
        .await
        .map_err(|e| e.to_string())?
    {
        return Err("Profile with this handle already exists".to_string());
    }

    println!("Creating Profile");

    // Create new profile
    let mut active_profile = ActiveProfile::new();

    println!("Account Id: {:?}", request.account_id);
    if let Some(account_id) = request.account_id {
        active_profile = active_profile.with_account_id(account_id);
    }

    println!("Handle: {}", request.handle.clone());
    active_profile = active_profile.with_handle(request.handle);

    println!("Name: {:?}", request.name);
    if let Some(name) = request.name {
        active_profile = active_profile.with_name(name);
    }

    if let Some(image) = request.image {
        active_profile = active_profile.with_image(image);
    }

    if let Some(bio) = request.bio {
        active_profile = active_profile.with_bio(bio);
    }

    println!("Creating Profile");

    profile_service
        .create_profile(active_profile)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_profile(
    app_handle: AppHandle,
    id: String,
    request: UpdateProfileRequest,
) -> Result<Option<Profile>, String> {
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    // Get existing profile
    let existing_profile = match profile_service
        .get_profile_by_id(id.clone())
        .await
        .map_err(|e| e.to_string())?
    {
        Some(profile) => profile,
        None => return Err("Profile not found".to_string()),
    };

    // Convert to active model
    let mut active_profile: ActiveProfile = existing_profile.into();

    // Update fields if provided
    if let Some(name) = request.name {
        active_profile.name = sea_orm::Set(Some(name));
    }

    if let Some(image) = request.image {
        active_profile.image = sea_orm::Set(Some(image));
    }

    if let Some(bio) = request.bio {
        active_profile.bio = sea_orm::Set(Some(bio));
    }

    profile_service
        .update_profile(id, active_profile)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_profile(app_handle: AppHandle, id: String) -> Result<bool, String> {
    println!("delete_profile called with id: {}", id);
    let db_manager = app_handle.state::<crate::database::connection::DatabaseManager>();
    println!("Database manager retrieved successfully");
    let profile_service = ProfileService::new(db_manager.get_connection().clone());

    profile_service
        .delete_profile(id)
        .await
        .map_err(|e| e.to_string())
}
