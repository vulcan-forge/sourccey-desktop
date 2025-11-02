import { graphQLClient } from '@/api/Api';
import { calculateStringFromParameters } from '@/api/GraphQL/Parameters';
import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';
import { gql } from 'graphql-request';

//---------------------------------------------------------------------------------------------------//
// Cart Item Queries
//---------------------------------------------------------------------------------------------------//

export const queryActiveCartItems = async (accountId: string, p0?: { first: number; }) => {
    // Use the basic cartItems query that we know works, then filter client-side
    const response: any = await graphQLClient.request(
        gql`
            query {
                cartItems {
                    edges {
                        cursor
                        node {
                            id
                            account_id
                            store_item_id
                            quantity
                            price
                            currency
                            status
                            time_purchased
                            created_at
                            updated_at
                            store_item {
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

    const payload = (response as any)?.cartItems || { edges: [], pageInfo: {}, totalCount: 0 };

    // Filter for user's cart items and ACTIVE status
    if (payload.edges) {
        payload.edges = payload.edges.filter((edge: any) => 
            edge.node.account_id === accountId && edge.node.status === 'ACTIVE'
        );
    }

    return payload;
};

//---------------------------------------------------------------------------------------------------//
// Cart Item Mutations
//---------------------------------------------------------------------------------------------------//

export interface AddToCartInput {
    account_id: string;
    store_item_id: string;
    quantity: number;
    price?: number;
    currency?: string;
    status?: string;
}

export interface AddToCartResponse {
    cartItem?: {
        id: string;
        account_id: string;
        store_item_id: string;
        quantity: number;
        price: number;
        currency: string;
        status: string;
        time_purchased: string | null;
        created_at: string;
        updated_at: string;
        store_item?: {
            id: string;
            name: string;
            slug: string;
            description?: string;
            short_description?: string;
            price: number;
            currency: string;
            category: string;
            tags?: string[];
            is_active: boolean;
            is_featured: boolean;
            stock_quantity: number;
            low_stock_threshold: number;
        };
    };
    error?: {
        message: string;
    };
}

export const mutationAddToCart = async (input: AddToCartInput): Promise<AddToCartResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            mutation AddToCart($input: AddCartInput!) {
                addToCart(input: $input) {
                    cartItem {
                        id
                        account_id
                        store_item_id
                        quantity
                        price
                        currency
                        status
                        time_purchased
                        created_at
                        updated_at
                    }
                    error {
                        message
                    }
                }
            }
        `,
        { input }
    );

    const payload = response?.addToCart;
    console.info('🛒 Add to cart mutation response:', payload);
    return payload;
};

export interface UpdateCartItemInput {
    id: string;
    quantity?: number;
    price?: number;
    currency?: string;
    status?: string;
    time_purchased?: string;
}

export interface UpdateCartItemResponse {
    cartItem?: {
        id: string;
        account_id: string;
    store_item_id: string;
    quantity: number;
    price: number;
    currency: string;
        status: string;
        time_purchased: string | null;
        created_at: string;
        updated_at: string;
    };
    error?: {
        message: string;
    };
}

export const mutationUpdateCartItem = async (input: UpdateCartItemInput): Promise<UpdateCartItemResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            mutation UpdateCartItem($input: UpdateCartInput!) {
                updateCartItem(input: $input) {
                    cartItem {
                        id
                        account_id
                        store_item_id
                        quantity
                        price
                        currency
                        status
                        time_purchased
                        created_at
                        updated_at
                    }
                    error {
                        message
                    }
                }
            }
        `,
        { input }
    );

    const payload = response?.updateCartItem;
    console.info('📊 Update cart item mutation response:', payload);
    return payload;
};

export interface RemoveFromCartInput {
    ids: string[];
}

export interface RemoveFromCartResponse {
    error?: {
        message: string;
    };
}

export const mutationRemoveFromCart = async (input: RemoveFromCartInput): Promise<RemoveFromCartResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            mutation RemoveFromCart($input: DeleteCartInput!) {
                removeFromCart(input: $input) {
                    error {
                        message
                    }
                }
            }
        `,
        { input }
    );

    const payload = response?.removeFromCart;
    console.info('🗑️ Remove from cart mutation response:', payload);
    return payload;
};

//---------------------------------------------------------------------------------------------------//
// Checkout Mutations
//---------------------------------------------------------------------------------------------------//

export interface CheckoutCartInput {
    account_id: string;
    cart_item_ids: string[];
    currency: string;
    customer_email: string;
}

export interface CheckoutCartResponse {
    payment_intent_id?: string;
    client_secret?: string;
    total_amount?: number;
    currency?: string;
    status?: string;
    processed_cart_items?: Array<{
        id: string;
        account_id: string;
        store_item_id: string;
        quantity: number;
        price: number;
        currency: string;
        status: string;
        time_purchased: string | null;
        created_at: string;
        updated_at: string;
        store_item?: {
            id: string;
            name: string;
            slug: string;
            description?: string;
            short_description?: string;
            price: number;
            currency: string;
            category: string;
            tags?: string[];
            is_active: boolean;
            is_featured: boolean;
            stock_quantity: number;
            low_stock_threshold: number;
        };
    }>;
    error?: {
        message: string;
    };
}

//---------------------------------------------------------------------------------------------------//
// Checkout Cart Mutation (First Time Payment + Save Card)
//---------------------------------------------------------------------------------------------------//

export interface CheckoutCartRequest {
    account_id: string;
    cart_item_ids: string[];
    currency?: string;
    customer_email?: string;
}

export interface CheckoutCartResponse {
    payment_intent_id?: string;
    client_secret?: string;
    total_amount?: number;
    currency?: string;
    status?: string;
    processed_cart_items?: Array<{
        id: string;
        account_id: string;
        store_item_id: string;
        quantity: number;
        price: number;
        currency: string;
        status: string;
        time_purchased: string | null;
        created_at: string;
        updated_at: string;
        store_item?: {
            id: string;
            name: string;
            slug: string;
            description?: string;
            short_description?: string;
            price: number;
            currency: string;
            category: string;
            tags?: string[];
            is_active: boolean;
            is_featured: boolean;
            stock_quantity: number;
            low_stock_threshold: number;
        };
    }>;
    error?: {
        message: string;
    };
}

export const mutationCheckoutCart = async (input: CheckoutCartRequest): Promise<CheckoutCartResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            mutation CheckoutCart($input: CheckoutInput!) {
                checkoutCart(input: $input) {
                    payment_intent_id
                    client_secret
                    total_amount
                    currency
                    status
                    processed_cart_items {
                        id
                        account_id
                        store_item_id
                        quantity
                        price
                        currency
                        status
                        time_purchased
                        created_at
                        updated_at
                        store_item {
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
                    error {
                        message
                    }
                }
            }
        `,
        { input }
    );

    const payload = response?.checkoutCart;
    console.info('💳 Checkout cart mutation response:', payload);
    return payload;
};

//---------------------------------------------------------------------------------------------------//
// Get Saved Payment Methods Query
//---------------------------------------------------------------------------------------------------//

export interface SavedPaymentMethod {
    id: string;
    card: {
        brand: string;
        last4: string;
        exp_month: number;
        exp_year: number;
    };
    type: string;
}

export interface GetSavedPaymentMethodsResponse {
    payment_methods?: SavedPaymentMethod[];
    error?: {
        message: string;
    };
}

export const queryGetSavedPaymentMethods = async (accountId: string): Promise<GetSavedPaymentMethodsResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            query GetSavedPaymentMethods($accountId: String!) {
                getSavedPaymentMethods(accountId: $accountId) {
                    payment_methods {
                        id
                        type
                        card {
                            brand
                            last4
                            exp_month
                            exp_year
                        }
                }
                error {
                    message
                }
            }
        }
        `,
        { accountId }
    );

    const payload = response?.getSavedPaymentMethods;
    console.info('💳 Saved payment methods query response:', payload);
    return payload;
};

//---------------------------------------------------------------------------------------------------//
// Off-Session Payment Mutation (Charge Saved Card)
//---------------------------------------------------------------------------------------------------//

export interface OffSessionPaymentInput {
    account_id: string;           // Real account ID from user profile
    amount: number;              // Amount to charge
    currency?: string;           // Optional, defaults to USD
    payment_method_id: string;   // ID of saved payment method to charge
}

export interface OffSessionPaymentResponse {
    payment_intent_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    error?: {
        message: string;
    };
}

export const mutationCreateOffSessionPayment = async (input: OffSessionPaymentInput): Promise<OffSessionPaymentResponse> => {
    const response: any = await graphQLClient.request(
        gql`
            mutation CreateOffSessionPayment($input: OffSessionPaymentInput!) {
                createOffSessionPayment(input: $input) {
                    payment_intent_id
                    status
                    amount
                    currency
                    error {
                        message
                    }
                }
            }
        `,
        { input }
    );

    const payload = response?.createOffSessionPayment;
    console.info('💳 Off-session payment mutation response:', payload);
        return payload;
};
