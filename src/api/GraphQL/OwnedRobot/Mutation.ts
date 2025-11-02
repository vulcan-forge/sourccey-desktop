import { graphQLClient } from '@/api/Api';
import type { AddOwnedRobotInput } from '@/api/GraphQL/OwnedRobot/Types/AddOwnedRobot/AddInput';
import type { DeleteOwnedRobotInput } from '@/api/GraphQL/OwnedRobot/Types/DeleteOwnedRobot/DeleteInput';
import type { UpdateOwnedRobotInput } from '@/api/GraphQL/OwnedRobot/Types/UpdateOwnedRobot/UpdateInput';
import { gql } from 'graphql-request';

//---------------------------------------------------------------------------------------------------//
// CRUD Robot Mutations
//---------------------------------------------------------------------------------------------------//
export const mutateAddOwnedRobot = async (input: AddOwnedRobotInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation AddOwnedRobot($input: AddOwnedRobotInput!) {
                addOwnedRobot(input: $input) {
                    ownedRobot {
                        id
                    }
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const addPayload = response?.addOwnedRobot || {};
    return addPayload;
};

export const mutateUpdateOwnedRobot = async (input: UpdateOwnedRobotInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation UpdateOwnedRobot($input: UpdateOwnedRobotInput!) {
                updateOwnedRobot(input: $input) {
                    ownedRobot {
                        id
                    }
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const updatePayload = response?.updateOwnedRobot || {};
    return updatePayload;
};

export const mutateDeleteOwnedRobot = async (input: DeleteOwnedRobotInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation DeleteOwnedRobot($input: DeleteOwnedRobotInput!) {
                deleteOwnedRobot(input: $input) {
                    ownedRobot {
                        id
                    }
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const deletePayload = response?.deleteOwnedRobot || {};
    return deletePayload;
};

//---------------------------------------------------------------------------------------------------//
