// src/client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
// MODIFIED: Import AppRouter directly from the .ts source file for accurate type inference
import type { AppRouter } from './generated/server';
import fetch from 'node-fetch'; // Polyfill für fetch im Node.js Umfeld

// Polyfill für globale fetch und Headers API, falls nicht vorhanden (für Node.js < 18)
if (!global.fetch) {
	(global as any).fetch = fetch;
}
if (!global.Headers) {
	(global as any).Headers = (fetch as any).Headers;
}

const trpc = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: 'http://localhost:3000/trpc', // URL deines tRPC Servers
			// Du kannst hier auch `fetch` Optionen übergeben, falls nötig
		}),
	],
});

async function main() {
	try {
		console.log("Abrufen aller Benutzer...");
		const users = await trpc.user.findMany.query(); // Beispiel: Annahme einer 'findMany' Prozedur
		console.log('Benutzer:', users);

		// Beispiel: Einen neuen Benutzer erstellen (Annahme einer 'create' Prozedur)
		// const newUser = await trpc.user.create.mutate({ email: 'test@example.com', name: 'Test User' });
		// console.log('Neuer Benutzer:', newUser);

		console.log("\nAbrufen aller Blogbeiträge...");
		const posts = await trpc.blogPost.findMany.query(); // Beispiel: Annahme einer 'list' Prozedur
		console.log('Blogbeiträge:', posts);

		// Du kannst hier weitere Aufrufe hinzufügen, um andere Endpunkte zu testen
		// z.B. einen einzelnen Blogbeitrag abrufen, wenn du eine `getById` Prozedur hast:
		// if (posts && posts.length > 0 && posts[0]) {
		//   const firstPostId = posts[0].id; // Annahme, dass jeder Post eine ID hat
		//   console.log(`\nAbrufen des Blogbeitrags mit ID: ${firstPostId}...`);
		//   const singlePost = await trpc.blogPost.getById.query({ id: firstPostId });
		//   console.log('Einzelner Blogbeitrag:', singlePost);
		// }

		// Teste einen Tag-Router, falls vorhanden
		// console.log("\nAbrufen aller Tags...");
		// const tags = await trpc.tag.list.query();
		// console.log('Tags:', tags);

	} catch (error) {
		console.error('Fehler beim Testen des tRPC Clients:', error);
	}
}

main();
