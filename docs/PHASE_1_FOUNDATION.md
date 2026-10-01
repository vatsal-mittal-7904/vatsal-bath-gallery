# Phase 1: Foundation

## Repository Audit Summary
The initial repository at `/Users/vatsalmittal7904/Desktop/vatsal bath gallery` was completely empty and not version-controlled. There was no existing architecture, configuration, or code.

## Technology Decisions & Deviations
Since the repository was empty, we initialized a fresh project using Next.js (with the App Router).
We opted for a **Modular Monolith** using Next.js for both the frontend (React Server Components) and backend (Next.js Route Handlers). 
- **Deviation from Express**: The prompt suggested Express as a potential backend, but explicitly stated: "If a Next.js application already handles the backend needs adequately, do not add Express merely for architectural appearance." A Next.js API layer provides seamless typing, easier deployment, and lower operational overhead than maintaining a separate Express server and Next.js frontend in a monorepo.
- **Frontend**: Next.js, React 19, Tailwind CSS v4, TypeScript.
- **Backend**: Next.js Route Handlers, Node.js.
- **Database**: PostgreSQL with Prisma ORM.

## Final Folder Structure
```text
project-root/
├── src/
│   ├── app/                  # App Router (UI routes & API routes)
│   │   ├── api/              # Backend API layer
│   │   └── ...               # Frontend pages and layouts
│   ├── components/           # Shared UI components
│   ├── features/             # Domain-specific logic (future: auth, estimates)
│   ├── lib/                  # Shared utilities (db client, config)
│   └── types/                # Global TypeScript types
├── prisma/                   # Database schema, migrations, and seed
├── docs/                     # Project documentation
├── tests/                    # Testing infrastructure
├── package.json
└── tsconfig.json
```

## Major Dependencies
- **Next.js**: Provides both the React frontend (App Router) and the Node.js backend (Route Handlers) in one cohesive package.
- **Tailwind CSS**: Utility-first CSS framework for rapid and consistent UI development.
- **TypeScript**: Ensures type safety across both frontend and backend boundaries.
- **Prisma**: Type-safe ORM for interacting with PostgreSQL.
- **Zod** (to be installed): For runtime environment validation and API payload validation.

## Development Workflow
1. Install dependencies: `npm install`
2. Run development server: `npm run dev`
3. The application will be available at `http://localhost:3000`

## Existing Technical Debt
None. The project is a clean slate.
