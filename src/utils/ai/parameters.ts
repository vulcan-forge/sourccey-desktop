import type { TrainingConfig } from '@/types/Module/AIModels/ai-model';

// Function to format parameter count
export const formatParameterCount = (params: number): string => {
    if (params >= 1_000_000_000) {
        return `${(params / 1_000_000_000).toFixed(1)}B`;
    } else if (params >= 1_000_000) {
        return `${(params / 1_000_000).toFixed(1)}M`;
    } else if (params >= 1_000) {
        return `${(params / 1_000).toFixed(1)}K`;
    } else {
        return params.toString();
    }
};

// Function to estimate parameters from training configuration
export const estimateModelParameters = (trainConfig: TrainingConfig): number => {
    const policy = trainConfig.policy;

    // ResNet18 backbone: ~11.7M parameters
    let resnetParams = 0;
    if (policy.vision_backbone.toLowerCase().includes('resnet18')) {
        resnetParams = 11_700_000;
    } else if (policy.vision_backbone.toLowerCase().includes('resnet50')) {
        resnetParams = 25_600_000;
    } else if (policy.vision_backbone.toLowerCase().includes('resnet101')) {
        resnetParams = 44_500_000;
    } else {
        resnetParams = 20_000_000; // Default estimate for other backbones
    }

    // Transformer encoder parameters (corrected)
    const encoderParams =
        policy.n_encoder_layers *
        // Self-attention: 3 * dim_model² (Q, K, V) + dim_model² (output projection)
        (3 * policy.dim_model * policy.dim_model + // Q, K, V projections
            1 * policy.dim_model * policy.dim_model + // Output projection
            // Feedforward: dim_model * dim_feedforward + dim_feedforward * dim_model
            policy.dim_model * policy.dim_feedforward + // First linear layer
            policy.dim_feedforward * policy.dim_model); // Second linear layer

    // Transformer decoder parameters (corrected)
    const decoderParams =
        policy.n_decoder_layers *
        // Self-attention: 3 * dim_model² (Q, K, V) + dim_model² (output projection)
        (3 * policy.dim_model * policy.dim_model + // Q, K, V projections
            1 * policy.dim_model * policy.dim_model + // Output projection
            // Cross-attention: 3 * dim_model² (Q, K, V) + dim_model² (output projection)
            3 * policy.dim_model * policy.dim_model + // Q, K, V projections
            1 * policy.dim_model * policy.dim_model + // Output projection
            // Feedforward: dim_model * dim_feedforward + dim_feedforward * dim_model
            policy.dim_model * policy.dim_feedforward + // First linear layer
            policy.dim_feedforward * policy.dim_model); // Second linear layer

    // VAE parameters (if enabled)
    let vaeParams = 0;
    if (policy.use_vae) {
        vaeParams = policy.n_vae_encoder_layers * (policy.latent_dim * policy.dim_model * 2);
    }

    // Input/output projections (simplified)
    let projectionParams = 0;

    // State projection: 12 -> dim_model
    const stateSize = 12;
    projectionParams += stateSize * policy.dim_model;

    // Output projection: dim_model -> action_size (12)
    const actionSize = 12;
    projectionParams += policy.dim_model * actionSize;

    // Layer normalization parameters
    const normParams = (policy.n_encoder_layers + policy.n_decoder_layers) * policy.dim_model * 2;

    // Other components (positional encodings, etc.)
    const otherParams = 500_000;

    const total = resnetParams + encoderParams + decoderParams + vaeParams + projectionParams + normParams + otherParams;
    return total;
};
