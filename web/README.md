# Uzum Dashboard - Frontend

Analytics and finance dashboard for Uzum Market.

## Project Structure

```
web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth routes (login, register)
│   │   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page (redirects to login)
│   │   └── globals.css        # Global styles + design tokens
│   │
│   ├── components/
│   │   ├── providers.tsx      # QueryClient provider
│   │   ├── ui/                # Reusable UI components (shadcn/ui)
│   │   ├── dashboard/         # Dashboard-specific components
│   │   ├── shared/            # Shared components
│   │   └── forms/             # Form components
│   │
│   ├── lib/
│   │   └── utils.ts           # Utility functions
│   │
│   ├── stores/                # Zustand stores
│   │   ├── auth-store.ts      # Auth state
│   │   └── dashboard-store.ts # UI state
│   │
│   ├── hooks/                 # Custom React hooks
│   └── types/                 # TypeScript types
│
├── components.json            # shadcn/ui configuration
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Date**: date-fns
- **Forms**: React Hook Form + Zod

## Design System

Dark premium SaaS dashboard with Apple + Stripe + Vercel aesthetics.

### Colors
- Base: `#09090b` (background)
- Elevated: `#0a0a0f` (cards)
- Primary: `#8b5cf6` (accent)
- Border: `#27272a`

### Typography
- Sans: Inter
- Mono: JetBrains Mono (numbers, data)

### Spacing
- Compact: 0.25rem - 0.5rem
- Default: 0.75rem - 1rem
- Spacious: 1.5rem - 2rem

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

### Route Structure
```
/                → redirects to /login
/login           → login page
/dashboard       → main dashboard
/dashboard/analytics  → analytics
/dashboard/products   → products
/dashboard/finance    → finance
/dashboard/ai        → AI insights
/dashboard/settings  → settings
```

### State Management
- **Auth Store**: User data, authentication state, active store
- **Dashboard Store**: Sidebar state, theme, mobile menu

### Data Fetching
- TanStack Query for server state
- Automatic caching and refetching
- Optimistic updates

### Component Strategy
- UI components in `src/components/ui/` (reusable, headless)
- Dashboard components in `src/components/dashboard/`
- Shared components in `src/components/shared/`
- All components use design system tokens