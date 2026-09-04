# React + Vite

## AQMRG development

Run the frontend with `npm run dev`. Raw Analysis uses the historical readings API for its built-in charts and supports both nested PythonAnywhere rows and flattened Vercel/MongoDB rows.

An optional Grafana view is available automatically during local development at `http://localhost:3000`. For a deployed frontend, configure an absolute dashboard URL at build time:

```env
VITE_GRAFANA_DASHBOARD_URL=https://grafana.example.com/d/aqmrg_live_01/aqmrg-real-time-insights?orgId=1&kiosk
```

The Docker Compose stack provisions that dashboard against InfluxDB. Grafana embedding is enabled, but anonymous access remains disabled by default; users can sign in to Grafana in the embedded view or open it full screen. Only set `GRAFANA_ANONYMOUS_ENABLED=true` when read-only public sensor visibility is intentional.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# aqmrg-frontend
