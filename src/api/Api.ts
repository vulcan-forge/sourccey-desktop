import { GraphQLClient } from 'graphql-request';

export const graphQLClient = new GraphQLClient(process.env.NEXT_PUBLIC_GRAPHQL_API_URL as string, {
    headers: {
        'GraphQL-preflight': '1',
    },
    credentials: 'include',
});
