// src/server/trpc.ts
import { db } from '@/db';
import { initTRPC } from '@trpc/server';
// Adjust the path if you place db.ts elsewhere

// Call connectDb when your server starts, e.g., in index.ts before starting the server,
// or here if appropriate for your setup. For simplicity in this example,
// we're not showing where connectDb() is called, but it needs to be called once.
// Example: await connectDb(); before httpServer.listen(4000); in index.ts

export const createContext = async ({ req, res }: any) => { // Make it async if needed
	// If connectDb is not called globally, you might connect here,
	// but be mindful of creating too many connections.
	// await connectDb(); // Or ensure it's connected
	return {
		db: db, // <--- ADD DB INSTANCE TO CONTEXT
		// ... other context properties
	};
};
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();
export { t };

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure;