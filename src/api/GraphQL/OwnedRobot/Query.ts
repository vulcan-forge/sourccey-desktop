import { calculateStringFromParameters } from '@/api/GraphQL/Parameters';

import { graphQLClient } from '@/api/Api';
import { gql } from 'graphql-request';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';

export const queryOwnedRobot = async (id: string) => {
    const response: any = await graphQLClient.request(
        gql`
            query GetOwnedRobot($id: String!) {
                ownedRobot(id: $id) {
                    id
                    nickname
                    registration_date
                    robot {
                        id
                        name
                        long_name
                        description
                        short_description
                        image
                        github_url
                    }
                }
            }
        `,
        { id }
    );

    return response?.ownedRobot;
};

export const queryOwnedRobots = async (paginationParameters?: GraphQLPaginationParameters) => {
    const response: any = await graphQLClient.request(
        gql`
            query {
                ownedRobots(${calculateStringFromParameters(paginationParameters)}) {
                    edges {
                        cursor
                        node {
                            id
                            nickname
                            registration_date
                            robot {
                                id
                                name
                                long_name
                                description
                                short_description
                                image
                                github_url
                            }
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
        `
    );

    const payload = response?.ownedRobots || [];
    return payload;
};
