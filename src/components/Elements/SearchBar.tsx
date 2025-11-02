import { queryClient } from '@/hooks/default';
import { getSearchValue, INPUT_VALUE_KEY, setInputValue, setSearchValue, useGetInputValue } from '@/hooks/search.hook';
import clsx from 'clsx';
import { useEffect } from 'react';
import { FaSearch } from 'react-icons/fa';

type SearchBarProps = {
    classNames: string;
    placeholderText: string;
    searchKey: any;
    refetchKey: any;
    filter: (value: string) => string;
};
export const SearchBar = ({ classNames, placeholderText, searchKey, refetchKey, filter }: SearchBarProps) => {
    const { data: inputValue }: any = useGetInputValue(INPUT_VALUE_KEY);
    useEffect(() => {
        const timer = setTimeout(() => {
            const searchValue = getSearchValue(searchKey);
            const value = filter(inputValue);

            if (searchValue !== value) {
                setSearchValue(searchKey, value);
                queryClient.refetchQueries(refetchKey);
            }
        }, 500);
        // Clear the timer when the component unmounts or when searchValue changes
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [searchKey, refetchKey, filter, inputValue]);

    return (
        <div className={clsx('relative flex', classNames)}>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <FaSearch className="h-4 w-4 text-gray-400" />
            </div>
            <input
                type="text"
                placeholder={placeholderText}
                className="w-full rounded-lg bg-slate-700 py-2 pr-4 pl-10 text-white placeholder-gray-400 transition-all duration-200 hover:bg-slate-600 focus:ring-2 focus:ring-yellow-500/80 focus:outline-none"
                autoComplete="off"
                onKeyDown={(event: any) => {
                    if (event.key === 'Enter') {
                        setInputValue(INPUT_VALUE_KEY, event.target.value);
                    }
                }}
                onChange={(event: any) => setInputValue(INPUT_VALUE_KEY, event.target.value)}
                value={inputValue ?? ''}
            />
        </div>
    );
};

// Base Filters
export const DefaultGraphQLFilter = (input: string) => {
    if (input) {
        const lowerCase = input.toLowerCase();
        const upperCase = input.toUpperCase();
        const titleCase = input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();

        return `
            name: {
                or: [
                    { contains: "${lowerCase}" },
                    { contains: "${upperCase}" },
                    { contains: "${titleCase}" },
                    { contains: "${input}" }
                ]
            }
        `;
    }

    return '';
};

export const AccountGraphQLFilter = (input: string) => {
    if (input) {
        const lowerCase = input.toLowerCase();
        const upperCase = input.toUpperCase();
        const titleCase = input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();

        return `
            email: {
                or: [
                    { contains: "${lowerCase}" },
                    { contains: "${upperCase}" },
                    { contains: "${titleCase}" },
                    { contains: "${input}" }
                ]
            }
        `;
    }

    return '';
};
