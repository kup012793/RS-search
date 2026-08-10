Exit code: 0
Wall time: 3.7 seconds
Output:
# React + Vite

## Vercel deployment

This project can be deployed to Vercel without a database or environment variables.
The included `vercel.json` proxies the USP, EP, BP, and exchange-rate requests to
their official upstream services while preserving the same `/api/*` URLs used by
the local Vite development server.

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none

After deployment, verify one search from each of USP, EP, and BP because the app
depends on the availability and HTML structure of external official catalogues.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

