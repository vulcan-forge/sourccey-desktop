export interface StoreItem {
    id: string;
    name: string;
    slug: string;
    description?: string;
    short_description?: string;
    price: number;
    currency: string;
    category: string;
    tags: string[];
    is_active: boolean;
    is_featured: boolean;
    stock_quantity: number;
    low_stock_threshold: number;
    image?: string;
    inStock?: boolean;
    features?: StoreItemFeature[];
}

export interface StoreItemFeature {
    id: string;
    name: string;
    description: string;
}

export interface StoreItemNode {
    cursor: string;
    node: StoreItem;
}

export interface StoreItemEdge {
    edges: StoreItemNode[];
    pageInfo: {
        startCursor: string;
        endCursor: string;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    totalCount: number;
}
