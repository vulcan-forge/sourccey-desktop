use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIModel {
    pub repo_id: String,
    pub name: String,
    pub path: String,
    pub episodes: usize,
    pub robot_type: String,
    pub training_config: Option<TrainingConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrainingConfig {
    pub dataset: DatasetConfig,
    pub env: Option<serde_json::Value>,
    pub policy: PolicyConfig,
    pub output_dir: String,
    pub job_name: String,
    pub resume: bool,
    pub seed: u32,
    pub num_workers: u32,
    pub batch_size: u32,
    pub steps: u32,
    pub eval_freq: u32,
    pub log_freq: u32,
    pub save_checkpoint: bool,
    pub distributed_training: bool,
    pub num_gpus: u32,
    pub ddp_find_unused_parameters: bool,
    pub dataloader_persistent_workers: bool,
    pub dataloader_prefetch_factor: u32,
    pub save_freq: u32,
    pub use_policy_training_preset: bool,
    pub optimizer: OptimizerConfig,
    pub scheduler: Option<serde_json::Value>,
    pub eval: EvalConfig,
    pub wandb: WandbConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatasetConfig {
    pub repo_id: String,
    pub root: Option<serde_json::Value>,
    pub episodes: Option<serde_json::Value>,
    pub image_transforms: ImageTransformsConfig,
    pub revision: Option<serde_json::Value>,
    pub use_imagenet_stats: bool,
    pub video_backend: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageTransformsConfig {
    pub enable: bool,
    pub max_num_transforms: u32,
    pub random_order: bool,
    pub tfs: TransformFunctions,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransformFunctions {
    pub brightness: TransformConfig,
    pub contrast: TransformConfig,
    pub saturation: TransformConfig,
    pub hue: TransformConfig,
    pub sharpness: TransformConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransformConfig {
    pub weight: f64,
    pub r#type: String,
    pub kwargs: TransformKwargs,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransformKwargs {
    pub brightness: Option<[f64; 2]>,
    pub contrast: Option<[f64; 2]>,
    pub saturation: Option<[f64; 2]>,
    pub hue: Option<[f64; 2]>,
    pub sharpness: Option<[f64; 2]>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PolicyConfig {
    pub r#type: String,
    pub n_obs_steps: u32,
    pub normalization_mapping: NormalizationMapping,
    pub input_features: InputFeatures,
    pub output_features: OutputFeatures,
    pub device: String,
    pub use_amp: bool,
    pub push_to_hub: bool,
    pub repo_id: Option<serde_json::Value>,
    pub private: Option<serde_json::Value>,
    pub tags: Option<serde_json::Value>,
    pub license: Option<serde_json::Value>,
    pub chunk_size: u32,
    pub n_action_steps: u32,
    pub vision_backbone: String,
    pub pretrained_backbone_weights: String,
    pub replace_final_stride_with_dilation: bool,
    pub pre_norm: bool,
    pub dim_model: u32,
    pub n_heads: u32,
    pub dim_feedforward: u32,
    pub feedforward_activation: String,
    pub n_encoder_layers: u32,
    pub n_decoder_layers: u32,
    pub use_vae: bool,
    pub latent_dim: u32,
    pub n_vae_encoder_layers: u32,
    pub temporal_ensemble_coeff: Option<serde_json::Value>,
    pub dropout: f64,
    pub kl_weight: f64,
    pub optimizer_lr: f64,
    pub optimizer_weight_decay: f64,
    pub optimizer_lr_backbone: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NormalizationMapping {
    #[serde(rename = "VISUAL")]
    pub visual: String,
    #[serde(rename = "STATE")]
    pub state: String,
    #[serde(rename = "ACTION")]
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InputFeatures {
    #[serde(rename = "observation.state")]
    pub observation_state: FeatureConfig,
    // Use a HashMap to store dynamic camera features
    #[serde(flatten)]
    pub observation_images: std::collections::HashMap<String, FeatureConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutputFeatures {
    pub action: FeatureConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeatureConfig {
    pub r#type: String,
    pub shape: Vec<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptimizerConfig {
    pub r#type: String,
    pub lr: f64,
    pub weight_decay: f64,
    pub grad_clip_norm: f64,
    pub betas: [f64; 2],
    pub eps: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvalConfig {
    pub n_episodes: u32,
    pub batch_size: u32,
    pub use_async_envs: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WandbConfig {
    pub enable: bool,
    pub disable_artifact: bool,
    pub project: String,
    pub entity: Option<serde_json::Value>,
    pub notes: Option<serde_json::Value>,
    pub run_id: Option<serde_json::Value>,
    pub mode: Option<serde_json::Value>,
}
