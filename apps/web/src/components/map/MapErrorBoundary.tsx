import { Component, type ReactNode } from 'react';
import { useLocale } from '../../i18n';
import { Button } from '../Button';

class MapBoundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

/** A failed map must leave discovery controls and list results available. */
export function MapErrorBoundary({ children, onShowList }: {
    children: ReactNode;
    onShowList: () => void;
}) {
    const { t } = useLocale();
    return <MapBoundary fallback={
        <div className='mh-empty' role='alert'>
            <p>{t('mapExplorer.tileError')}</p>
            <Button variant='secondary' onClick={onShowList}>{t('mapExplorer.list')}</Button>
        </div>
    }>{children}</MapBoundary>;
}
