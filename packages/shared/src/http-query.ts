export const readQueryString = (
    params: URLSearchParams,
    key: string,
): string | undefined => {
    const value = params.get(key);
    if (value === null || value.trim() === '') {
        return undefined;
    }

    return value;
};

export const requireQueryString = (
    params: URLSearchParams,
    key: string,
    createError: (key: string) => Error,
): string => {
    const value = readQueryString(params, key);
    if (!value) {
        throw createError(key);
    }

    return value;
};
