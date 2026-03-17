import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    errorMessage?: string;
}

export const Input = ({
    className = '',
    errorMessage,
    id,
    required,
    ...props
}: InputProps) => {
    const errorId = errorMessage && id ? `${id}-error` : undefined;
    const describedBy = [props['aria-describedby'], errorId]
        .filter((value): value is string => Boolean(value))
        .join(' ');

    return (
        <div className='space-y-1'>
            <input
                id={id}
                aria-invalid={errorMessage ? true : props['aria-invalid']}
                aria-required={required || props['aria-required'] || undefined}
                aria-describedby={
                    describedBy.length > 0 ? describedBy : undefined
                }
                className={[
                    'mh-input w-full px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent',
                    errorMessage ? 'border-mh-danger' : '',
                    className,
                ].join(' ')}
                required={required}
                {...props}
            />
            {errorMessage ?
                <p
                    id={errorId}
                    role='alert'
                    className='mh-alert text-xs font-bold'
                >
                    {errorMessage}
                </p>
            :   null}
        </div>
    );
};
