import { graphQLClient } from '@/api/Api';
import { calculateStringFromParameters } from '@/api/GraphQL/Parameters';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { gql } from 'graphql-request';

//---------------------------------------------------------------------------------------------------//
// Client Profile Queries
//---------------------------------------------------------------------------------------------------//
export const queryProfile = async (id?: string | null, handle?: string | null, email?: string | null) => {
    // If all 3 are null just return null
    if (id == null && handle == null && email == null) return null;

    const parameters = { id: id, handle: handle, email: email };

    const response: any = await graphQLClient.request(
        gql`
            query Profile($id: String, $handle: String, $email: String) {
                profile(id: $id, handle: $handle, email: $email) {
                    id
                    handle
                    name
                    image
                    account {
                        id
                        email
                        role
                    }
                }
            }
        `,
        parameters
    );
    const profilePayload = response?.profile || {};
    return profilePayload;
};

export const queryProfiles = async (paginationParameters?: GraphQLPaginationParameters) => {
    const response: any = await graphQLClient.request(
        gql`
            query {
                profiles(${calculateStringFromParameters(paginationParameters)}) {
                    edges {
                        cursor
                        node {
                            id
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
    const profilesPayload = response?.profiles || [];
    return profilesPayload;
};

export const queryIsProfileHandleAvailable = async (profileHandle: string) => {
    if (!profileHandle) return false;

    const parameters = { profileHandle };
    const response: any = await graphQLClient.request(
        gql`
            query IsProfileHandleAvailable($profileHandle: String!) {
                isProfileHandleAvailable(profileHandle: $profileHandle)
            }
        `,
        parameters
    );
    return response?.isProfileHandleAvailable ?? false;
};

//---------------------------------------------------------------------------------------------------//
