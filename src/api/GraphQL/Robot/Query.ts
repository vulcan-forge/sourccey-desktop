import { graphQLClient } from '@/api/Api';
import { calculateStringFromParameters } from '@/api/GraphQL/Parameters';
import type { GetRobotInput } from '@/api/GraphQL/Robot/Types/GetRobot/GetInput';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { gql } from 'graphql-request';

//---------------------------------------------------------------------------------------------------//
// Project Queries
//---------------------------------------------------------------------------------------------------//
export const queryRobot = async (input: GetRobotInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            query Robot($input: GetRobotInput!) {
                robot(input: $input) {
                    id
                    name
                    long_name
                    description
                    short_description
                    github_url
                    image
                    type
                    can_drive
                    can_walk
                    can_swim
                    can_fly
                    stats {
                        performance_index
                        cognitive_index
                        dexterity_index
                        energy_index
                        builds_count
                        last_build_at
                    }
                    features {
                        id
                        name
                        description
                        icon
                    }
                    media {
                        id
                        name
                        description
                        image
                    }
                }
            }
        `,
        parameters
    );
    const payload = response?.robot || {};
    return payload;
};

export const queryRobots = async (paginationParameters?: GraphQLPaginationParameters) => {
    const parameters = calculateStringFromParameters(paginationParameters);
    const response: any = await graphQLClient.request(
        gql`
            query {
                robots(${parameters}) {
                    edges {
                        cursor
                        node {
                            id
                            name
                            long_name
                            description
                            short_description
                            github_url
                            image
                            type
                            can_drive
                            can_walk
                            can_swim
                            can_fly
                            stats {
                                performance_index
                                cognitive_index
                                dexterity_index
                                energy_index
                                builds_count
                                last_build_at
                            }
                            features {
                                id
                                name
                                description
                                icon
                            }
                            media {
                                id
                                name
                                description
                                image
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
    const payload = response?.robots || [];
    return payload;
};
//---------------------------------------------------------------------------------------------------//
