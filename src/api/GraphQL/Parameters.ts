import type { GraphQLPaginationParameters } from '@/types/GraphQL/GraphQLPaginationParameters';

export const calculateStringFromParameters = (parameters?: GraphQLPaginationParameters, parenthesis?: boolean) => {
    const first = parameters?.first ? `first: ${parameters.first},` : '';
    const last = parameters?.last ? `last: ${parameters.last},` : '';
    const before = parameters?.before ? `before: ${parameters.before},` : '';
    const after = parameters?.after ? `after: ${parameters.after},` : '';
    const sort = parameters?.order ? `order: ${parameters.order},` : '';
    const where = parameters?.where ? `where: ${parameters.where},` : '';

    let parameterString = parameters ? `${first} ${last} ${before} ${after} ${sort} ${where}` : '';
    if (parenthesis) {
        parameterString = `(${parameterString})`;
    }
    return parameterString;
};

export const getPaginationVariables = (paginationParameters?: GraphQLPaginationParameters) => {
    const variables = {
        first: paginationParameters?.first,
        last: paginationParameters?.last,
        before: paginationParameters?.before,
        after: paginationParameters?.after,
        where: paginationParameters?.where,
        order: paginationParameters?.order,
    };
    const parameters = { paginationParameters: variables };
    return parameters;
};

export const setGraphQLParameters = (graphQLParameters: GraphQLPaginationParameters = {}, pageParam: any) => {
    graphQLParameters.after = pageParam;
    return graphQLParameters;
};

export const getNextPageParam = (lastPage: any) => {
    if (lastPage?.pageInfo?.endCursor && lastPage?.pageInfo?.hasNextPage) {
        return `"${lastPage?.pageInfo?.endCursor}"`;
    }
    return undefined;
};

export const getPreviousPageParam = (firstPage: any) => {
    if (firstPage?.pageInfo?.startCursor && firstPage?.pageInfo?.hasPreviousPage) {
        return `"${firstPage?.pageInfo?.startCursor}"`;
    }
    return undefined;
};
