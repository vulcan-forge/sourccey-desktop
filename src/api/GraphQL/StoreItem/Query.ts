import { graphQLClient } from '@/api/Api';
import { calculateStringFromParameters } from '@/api/GraphQL/Parameters';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { gql } from 'graphql-request';

export const queryStoreItems = async (paginationParameters?: GraphQLPaginationParameters) => {
    const rawParameters = calculateStringFromParameters(paginationParameters);
    // Remove trailing comma if it exists (common issue with parameter building)
    const parameters = rawParameters.trim().replace(/,$/, '');
    console.info('🔍 Raw GraphQL Parameters:', rawParameters);
    console.info('🔍 Clean GraphQL Parameters:', parameters);

    // Use GetActiveStoreItems to get only active items from the C# backend
    let query = gql`
        query {
            activeStoreItems(${parameters}) {
                edges {
                    cursor
                    node {
                        id
                        name
                        slug
                        description
                        short_description
                        price
                        currency
                        category
                        tags
                        is_active
                        is_featured
                        stock_quantity
                        low_stock_threshold
                    }
                }
                pageInfo {
                    startCursor
                    endCursor
                    hasNextPage
                    hasPreviousPage
                }
                totalCount
            }
        }
    `;

    console.info('📡 Sending GraphQL Query:', query);
    
    try {
        const response: any = await graphQLClient.request(query);
        console.info('📨 Raw GraphQL Response:', response);

        const payload = response?.activeStoreItems || [];
        console.info('📊 Parsed activeStoreItems Payload:', payload);

        if (payload.edges && payload.edges.length > 0) {
            console.info('🎯 First item received:', payload.edges[0]);
            console.info('🎯 First item node:', payload.edges[0].node);
            console.info('🎯 All items received:', payload.edges.map((edge: any) => edge.node));
        } else {
            console.warn('⚠️ No items received from GraphQL API');
        }

        console.info('📊 Final Stats:', {
            totalCount: payload.totalCount || 0,
            edgesCount: payload.edges?.length || 0,
            pageInfo: payload.pageInfo
        });

        return payload;
        
    } catch (error: any) {
        console.error('❌ GraphQL Query Failed:', error);
        console.error('❌ Full Error Details:', JSON.stringify(error, null, 2));
        throw error;
    }
};
