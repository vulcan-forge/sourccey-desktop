/**
 * Format DateTime to valid ISO-8601 format
 */
export const formatDateTimeISO8601 = (dateTimeString: string): string => {
    try {
        const date = new Date(dateTimeString);
        // Format to ISO string and truncate to microseconds (6 decimal places)
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch (error) {
        console.error('Error formatting DateTime:', error);
        return dateTimeString;
    }
};
