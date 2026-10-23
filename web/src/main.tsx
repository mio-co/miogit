import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, type LoaderFunctionArgs, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { MotionConfig } from 'motion/react';
import './styles/global.css';
import { load } from './app/api';
import { apiFor } from './app/paths';
import { I18nProvider } from './app/i18n';
import { SessionProvider } from './app/session';
import { RouteError, Shell } from './app/shell';
import { ConsoleHome, IndexPage, LoginPage } from './pages/home';
import { RepoFrame, SettingsFrame } from './components/app/repo-frame';

/** one loader for every page: the page URL maps to exactly one API URL (app/paths.ts) */
async function loader({ request }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  const api = apiFor(u.pathname, u.search);
  if (!api) {
    // not a frontend page (server-rendered): leave the SPA
    window.location.assign(u.pathname + u.search + u.hash);
    return new Promise<never>(() => {});
  }
  return load(api);
}

const routes: RouteObject[] = [
  {
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', loader, element: <IndexPage /> },
      { path: '/~mio', loader, element: <ConsoleHome /> },
      { path: '/~mio/login', loader, element: <LoginPage /> },
      { path: '/~mio/tokens', loader, element: <ConsoleHome dialog="tokens" /> },
      { path: '/~mio/password', loader, element: <ConsoleHome dialog="password" /> },
      { path: '/~mio/repos/:repo', loader, element: <SettingsFrame /> },
      { path: '/~mio/r/:repo/*', loader, element: <RepoFrame consoleMode /> },
      { path: '/:repo/*', loader, element: <RepoFrame consoleMode={false} /> },
    ],
  },
];

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </I18nProvider>
    </MotionConfig>
  </StrictMode>,
);
