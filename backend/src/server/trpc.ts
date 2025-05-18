// src/server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
// import type { NodePgDatabase } from 'drizzle-orm/node-postgres'; // Importiere deinen DB-Typ! ANPASSEN!
import { db } from '../db'; // Import the db instance
// import type { db as DBType } from '../db'; // Import the type of db. This was causing an issue.

/**
 * 1. Initialisierung - Definiere deinen Context
 *
 * Du kannst hier beliebige Daten für deinen Context definieren,
 * z.B. Datenbankverbindung, Authentifizierungs-Infos etc.
 */
export interface Context {
	// WICHTIG: Dein tRPC-Router-Generator erwartet 'db' im Context!
	db: typeof db; // <-- Use typeof db for the type
	// Beispiel für Auth-Infos (optional):
	// user?: { id: string; roles: string[] };
}

// Add a function to create the actual context for each request
export const createContext = async () => {
	// If you have async operations for context creation, make this async
	// For now, we just return the db instance.
	// Ensure connectDb() has been called once when the app starts.
	return {
		db,
	};
};

/**
 * 2. Initialisiere tRPC auf dem Server mit dem Context
 */
export const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();

/**
 * 3. Erstelle wiederverwendbare Komponenten
 *    - `router`: Zum Erstellen von Routern
 *    - `publicProcedure`: Eine Basis-Prozedur, die jeder aufrufen kann
 *    - `protectedProcedure`: Eine Basis-Prozedur, die z.B. Authentifizierung erfordert
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Beispiel für eine geschützte Prozedur (Auth Middleware)
 *
 * HINWEIS: Für den Anfang kannst du protectedProcedure = publicProcedure setzen,
 * wenn du noch keine Authentifizierung hast.
 */
const isAuthenticated = t.middleware(({ ctx, next }) => {
	// Beispiel: Prüfe, ob ein Benutzer im Context ist
	// if (!ctx.user) {
	//   throw new TRPCError({ code: 'UNAUTHORIZED' });
	// }
	console.warn("WARNUNG: protectedProcedure prüft aktuell keine Authentifizierung!"); // Entfernen, wenn Auth implementiert ist
	return next({
		ctx: {
			// ... ggf. Context erweitern, z.B. mit user
			// user: ctx.user,
		},
	});
});

// Erstelle die geschützte Prozedur durch Anwenden der Middleware
export const protectedProcedure = t.procedure.use(isAuthenticated);

// Oder wenn du *noch keine* Auth brauchst (einfacher Start):
// export const protectedProcedure = publicProcedure;