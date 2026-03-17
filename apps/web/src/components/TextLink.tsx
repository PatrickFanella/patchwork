import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';

interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    /** When true, indicates the link opens in a new window/tab */
    external?: boolean;
}

export const TextLink = ({
    children,
    className = '',
    external,
    ...props
}: PropsWithChildren<TextLinkProps>) => {
    const externalProps = external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {};

    return (
        <a
            className={[
                'mh-link font-medium underline decoration-mh-accent underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mh-accent',
                className,
            ].join(' ')}
            {...externalProps}
            {...props}
        >
            {children}
            {external ? (
                <span className='sr-only'> (opens in a new tab)</span>
            ) : null}
        </a>
    );
};
