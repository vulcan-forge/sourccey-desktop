import clsx from 'clsx';

const colorMapping = {
    white: 'text-white',
    yellow: 'text-yellow-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    sky: 'text-sky-500',
    red: 'text-red-500',
    orange: 'text-orange-500',
    purple: 'text-purple-500',
    black: 'text-black',
};

export const Spinner = ({
    color = 'white',
    width = 'w-5',
    height = 'h-5',
}: {
    color?: keyof typeof colorMapping;
    width?: string;
    height?: string;
}) => {
    const textColor = colorMapping[color];
    return (
        <div>
            <svg className={clsx('animate-spin', width, height, textColor)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    );
};
