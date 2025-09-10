# Overview

This is a full-stack web application built for managing teacher schedules and classroom assignments in German schools (SCHILD NRW). The system helps optimize teaching workloads, manage staff assignments, and calculate required teaching positions (Planstellen). It features a modern React frontend with a comprehensive dashboard for school administration, teacher management, class management, and intelligent assignment optimization.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript in a Vite development environment
- **UI Library**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod schema validation for type-safe form management
- **Design System**: Consistent component library with dark/light mode support and CSS variables for theming

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Database ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **API Design**: RESTful API endpoints with structured error handling and request logging middleware
- **File Handling**: Multer middleware for CSV file uploads and processing
- **Development**: Hot module replacement with Vite integration for seamless development experience

## Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless database hosting
- **Schema Management**: Drizzle migrations for version-controlled database schema changes
- **Data Models**: Teachers, Students, Classes, Subjects, Assignments, and Planstellen with proper foreign key relationships
- **Validation**: Shared Zod schemas between frontend and backend for consistent data validation

## Core Features
- **Teacher Management**: Complete CRUD operations for teacher profiles, qualifications, and workload tracking
- **Class Management**: Organization of student groups with grade levels and subject hour requirements
- **Assignment Optimization**: Intelligent algorithm for optimizing teacher-class-subject assignments based on qualifications and workload balancing
- **CSV Import System**: Bulk data import functionality with error handling and validation
- **Dashboard Analytics**: Real-time statistics and visual representations of school staffing metrics
- **Planstellen Calculation**: Automated calculation of required teaching positions based on curriculum requirements

## Authentication and Authorization
- Currently configured for development without authentication
- Session management infrastructure prepared with connect-pg-simple for PostgreSQL session storage
- Role-based access control ready for implementation

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **WebSocket Support**: Real-time database connections using ws library for Neon compatibility

## UI and Styling
- **Radix UI**: Accessible component primitives for complex UI interactions
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Lucide React**: Icon library for consistent iconography
- **Google Fonts**: Inter font family for typography

## Development Tools
- **Vite**: Build tool and development server with hot reload capabilities
- **TypeScript**: Static type checking for enhanced developer experience
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit Integration**: Custom plugins for Replit development environment compatibility

## Data Processing
- **Date-fns**: Date manipulation and formatting utilities
- **CSV Parser**: Custom CSV processing logic for bulk data imports
- **Zod**: Runtime type validation and schema parsing
- **Class Variance Authority**: Type-safe CSS class management for component variants