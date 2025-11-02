import { graphQLClient } from '@/api/Api';
import type { ForgotPasswordInput } from '@/api/GraphQL/Account/Types/ForgotPassword/ForgotPasswordInput';
import type { LoginInput } from '@/api/GraphQL/Account/Types/Login/LoginInput';
import type { ResetPasswordInput } from '@/api/GraphQL/Account/Types/ResetPassword/ResetPasswordInput';
import { gql } from 'graphql-request';

//---------------------------------------------------------------------------------------------------//
// Signed In Functions
//---------------------------------------------------------------------------------------------------//
export const mutateLogin = async (input: LoginInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation Login($input: LoginInput!) {
                login(input: $input) {
                    account {
                        id
                    }
                    created
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const loginPayload = response?.login || {};
    return loginPayload;
};

export const mutateForgotPassword = async (input: ForgotPasswordInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation ForgotPassword($input: ForgotPasswordInput!) {
                forgotPassword(input: $input) {
                    success
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const forgotPasswordPayload = response?.forgotPassword || {};
    return forgotPasswordPayload;
};

export const mutateResetPassword = async (input: ResetPasswordInput) => {
    const parameters = { input: input };
    const response: any = await graphQLClient.request(
        gql`
            mutation ResetPassword($input: ResetPasswordInput!) {
                resetPassword(input: $input) {
                    success
                    error {
                        message
                    }
                }
            }
        `,
        parameters
    );
    const resetPasswordPayload = response?.resetPassword || {};
    return resetPasswordPayload;
};
//---------------------------------------------------------------------------------------------------//
