import { queryStoreItems } from '@/api/GraphQL/StoreItem/Query';
import type { StoreItem, StoreItemEdge } from '@/types/Models/store-item';

// Helper function to parse tags from JSON string to array
const parseTags = (tagsString: string | null): string[] => {
    if (!tagsString) return [];
    try {
        const parsed = JSON.parse(tagsString);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// Helper function to transform store item from backend format
const transformStoreItem = (item: any): StoreItem => ({
    ...item,
    tags: parseTags(item.tags),
    category: item.category.toString(), // Convert enum to string
});

export const getAllStoreItems = async (): Promise<StoreItem[]> => {
    try {
        const response: StoreItemEdge = await queryStoreItems({
            first: 50, // Backend limit is 50 items per page
        });

        if (!response.edges || response.edges.length === 0) {
            return [];
        }

        // Transform the edges to just the nodes (StoreItem objects) and parse tags
        return response.edges.map(edge => transformStoreItem(edge.node));
    } catch (error) {
        console.error('Error fetching store items:', error);
        throw error;
    }
};

export const getStoreItemsByCategory = async (category: string): Promise<StoreItem[]> => {
    try {
        const allItems = await getAllStoreItems();
        return allItems.filter(item => item.category.toLowerCase() === category.toLowerCase());
    } catch (error) {
        console.error('Error fetching store items by category:', error);
        throw error;
    }
};

export const getFeaturedStoreItems = async (): Promise<StoreItem[]> => {
    try {
        const allItems = await getAllStoreItems();
        return allItems.filter(item => item.is_featured);
    } catch (error) {
        console.error('Error fetching featured store items:', error);
        throw error;
    }
};

export const getStoreItemsInStock = async (): Promise<StoreItem[]> => {
    try {
        const allItems = await getAllStoreItems();
        return allItems.filter(item => item.stock_quantity > 0);
    } catch (error) {
        console.error('Error fetching store items in stock:', error);
        throw error;
    }
};
