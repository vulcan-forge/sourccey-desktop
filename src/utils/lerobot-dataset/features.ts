export const getFeatures = (dataset: any) => {
    // If dataset already has features, return them
    if (dataset.features && Array.isArray(dataset.features)) {
        return dataset.features;
    }

    // Parse features from dataset name
    const name = dataset.name || '';

    // Match patterns like: -a, -b, -c, -2a, -3b, etc.
    // This regex looks for a dash followed by optional numbers and a single letter
    const featureMatches = name.match(/-(\d*[a-z])/g);

    if (!featureMatches) {
        return [];
    }

    // Extract the feature letters (remove the dash and numbers)
    const features = featureMatches.map((match: string) => {
        // Remove the leading dash and extract just the letter
        const feature = match.substring(1); // Remove the dash
        // Extract the letter part (remove any numbers)
        const letter = feature.replace(/\d+/g, '');
        return letter;
    });

    // Remove duplicates and sort
    return [...new Set(features)].sort();
};
