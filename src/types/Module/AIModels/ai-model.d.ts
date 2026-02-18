export interface AIModel {
    repo_id: string;
    name: string;
    path: string;
    highest_checkpoint_step: number | null;
    episodes: number;
    robot_type: string;
    training_config: TrainingConfig | null;
}

export interface HuggingFaceModelCard {
    repo_id: string;
    model_name: string;
    description: string | null;
    size_bytes: number | null;
    downloads: number | null;
    likes: number | null;
    last_modified: string | null;
    downloaded: boolean;
    snapshot_path: string | null;
    highest_checkpoint_step: number | null;
    pretrained_model_path: string | null;
    has_enough_space: boolean | null;
}

export interface HuggingFaceOrganizationCatalog {
    organization: string;
    cache_path: string;
    free_bytes: number;
    models: HuggingFaceModelCard[];
}

export interface HuggingFaceModelDownloadResult {
    cache_path: string;
    free_bytes_before: number;
    free_bytes_after: number;
    model: HuggingFaceModelCard;
}

export interface HuggingFaceModelDeleteResult {
    status: 'deleted' | 'not_found';
    message: string;
    repo_id: string;
    free_bytes_before: number;
    free_bytes_after: number;
}

export interface HuggingFaceModelDownloadResponse {
    status: 'completed' | 'replace_required' | 'failed';
    message: string;
    result: HuggingFaceModelDownloadResult | null;
}

export interface HuggingFaceDownloadProgressEvent {
    repo_id: string;
    status_text: string;
    progress_percent: number | null;
}

export interface HuggingFaceModelDownloadCompletionEvent {
    repo_id: string;
    response: HuggingFaceModelDownloadResponse;
}

// Training Configuration Types
export interface TrainingConfig {
    dataset: DatasetConfig;
    env: any | null;
    policy: PolicyConfig;
    output_dir: string;
    job_name: string;
    resume: boolean;
    seed: number;
    num_workers: number;
    batch_size: number;
    steps: number;
    eval_freq: number;
    log_freq: number;
    save_checkpoint: boolean;
    distributed_training: boolean;
    num_gpus: number;
    ddp_find_unused_parameters: boolean;
    dataloader_persistent_workers: boolean;
    dataloader_prefetch_factor: number;
    save_freq: number;
    use_policy_training_preset: boolean;
    optimizer: OptimizerConfig;
    scheduler: any | null;
    eval: EvalConfig;
    wandb: WandbConfig;
}

// Dataset Configuration
export interface DatasetConfig {
    repo_id: string;
    root: any | null;
    episodes: any | null;
    image_transforms: ImageTransformsConfig;
    revision: any | null;
    use_imagenet_stats: boolean;
    video_backend: string;
}

// Image Transforms Configuration
export interface ImageTransformsConfig {
    enable: boolean;
    max_num_transforms: number;
    random_order: boolean;
    tfs: TransformFunctions;
}

export interface TransformFunctions {
    brightness: TransformConfig;
    contrast: TransformConfig;
    saturation: TransformConfig;
    hue: TransformConfig;
    sharpness: TransformConfig;
}

export interface TransformConfig {
    weight: number;
    type: string;
    kwargs: TransformKwargs;
}

export interface TransformKwargs {
    brightness?: [number, number];
    contrast?: [number, number];
    saturation?: [number, number];
    hue?: [number, number];
    sharpness?: [number, number];
}

// Policy Configuration
export interface PolicyConfig {
    type: string;
    n_obs_steps: number;
    normalization_mapping: NormalizationMapping;
    input_features: InputFeatures;
    output_features: OutputFeatures;
    device: string;
    use_amp: boolean;
    push_to_hub: boolean;
    repo_id: any | null;
    private: any | null;
    tags: any | null;
    license: any | null;
    chunk_size: number;
    n_action_steps: number;
    vision_backbone: string;
    pretrained_backbone_weights: string;
    replace_final_stride_with_dilation: boolean;
    pre_norm: boolean;
    dim_model: number;
    n_heads: number;
    dim_feedforward: number;
    feedforward_activation: string;
    n_encoder_layers: number;
    n_decoder_layers: number;
    use_vae: boolean;
    latent_dim: number;
    n_vae_encoder_layers: number;
    temporal_ensemble_coeff: any | null;
    dropout: number;
    kl_weight: number;
    optimizer_lr: number;
    optimizer_weight_decay: number;
    optimizer_lr_backbone: number;
}

export interface NormalizationMapping {
    VISUAL: string;
    STATE: string;
    ACTION: string;
}

export interface InputFeatures {
    'observation.state': FeatureConfig;
    'observation.images.left': FeatureConfig;
    'observation.images.right': FeatureConfig;
}

export interface OutputFeatures {
    action: FeatureConfig;
}

export interface FeatureConfig {
    type: string;
    shape: number[];
}

// Optimizer Configuration
export interface OptimizerConfig {
    type: string;
    lr: number;
    weight_decay: number;
    grad_clip_norm: number;
    betas: [number, number];
    eps: number;
}

// Evaluation Configuration
export interface EvalConfig {
    n_episodes: number;
    batch_size: number;
    use_async_envs: boolean;
}

// Weights & Biases Configuration
export interface WandbConfig {
    enable: boolean;
    disable_artifact: boolean;
    project: string;
    entity: any | null;
    notes: any | null;
    run_id: any | null;
    mode: any | null;
}

// AI Policy Interface (existing)
export interface AIPolicy {
    // Add policy-specific properties as needed
    type?: string;
    config?: PolicyConfig;
}
