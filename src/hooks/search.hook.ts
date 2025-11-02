import { queryClient } from '@/hooks/default';
import { useQuery } from '@tanstack/react-query';

const BASE_SEARCH_KEY = 'search';
const BASE_INPUT_KEY = 'input';
export const SEARCH_VALUE_KEY = [BASE_SEARCH_KEY];
export const INPUT_VALUE_KEY = [BASE_SEARCH_KEY, BASE_INPUT_KEY];

//---------------------------------------------------------------------------------------------------//
// Has Search Value Functions
//---------------------------------------------------------------------------------------------------//
export const getInputValue = (key: any) => queryClient.getQueryData(key);
export const setInputValue = (key: any, searchInput: any) => queryClient.setQueryData(key, searchInput);
export const useGetInputValue = (key: any) => useQuery({ queryKey: key, queryFn: () => getInputValue(key), initialData: '' });

export const getSearchValue = (key: any) => queryClient.getQueryData(key);
export const setSearchValue = (key: any, value: any) => queryClient.setQueryData(key, value);
export const useGetSearchValue = (key: any) => useQuery({ queryKey: key, queryFn: () => getSearchValue(key), initialData: '' });

//---------------------------------------------------------------------------------------------------//
