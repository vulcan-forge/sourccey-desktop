import { GraphQLClient } from 'graphql-request';
import { getDesktopEnvironmentSettings } from '@/environments/environment';

const createGraphQLClient = (endpoint: string) =>
    new GraphQLClient(endpoint, {
        headers: {
            'GraphQL-preflight': '1',
        },
        credentials: 'include',
    });

export const getGraphQLClient = async () => {
    const settings = await getDesktopEnvironmentSettings();
    return createGraphQLClient(settings.graphqlApiUrl);
};

export const requestGraphQL = async <TResponse>(query: string, variables?: object) => {
    const graphQLClient = await getGraphQLClient();
    return graphQLClient.request<TResponse>(query, variables);
};
