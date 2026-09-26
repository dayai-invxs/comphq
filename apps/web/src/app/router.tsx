import { createBrowserRouter } from 'react-router'
import { routes } from './routes'

// A data router built once at module scope, as react-router asks: rebuilding
// it per render throws away the navigation state on every parent update.
export const router = createBrowserRouter(routes)
