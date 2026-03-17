import { FrontendShell } from './features/frontend-shell';

export const APP_TITLE = 'Patchwork';

export const App = () => {
    return <FrontendShell appTitle={APP_TITLE} />;
};
