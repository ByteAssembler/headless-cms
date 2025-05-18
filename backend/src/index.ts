/**
 * main.ts (oder build.ts)
 *
 * Beispielhafter Build-Prozess:
 * 1. Definiert Content Types.
 * 2. Generiert Drizzle Schema Code (.ts Dateien) und Index.
 * 3. Generiert Zod Schema Code (.ts Dateien) und Index.
 * 4. Generiert tRPC Router Code (.ts Dateien) und Index.
 *
 * Nach diesem Prozess würden 'tsc' und 'drizzle-kit' laufen.
 * Der Server importiert dann die kompilierten Artefakte.
 */

import { config } from 'dotenv';
import * as path from 'node:path'; // path needs to be imported before config
config({ path: path.join(import.meta.dirname, '../.env') });

import * as fs from 'node:fs';
// import * as path from 'node:path'; // Already imported
import _ from 'lodash';
import * as url from 'node:url'; // Import the 'url' module

// 1. Definitionen & Builder importieren
import { ContentTypeBuilder, FieldBuilder } from './fields/definitionBuilder'; // ANPASSEN

// 2. Drizzle Code Generator importieren
import { generateDrizzleSchemaFileContent } from './generator/drizzleSchemaCodeGenerator'; // ANPASSEN

// 3. Zod Code Generator importieren
import { generateZodSchemaFileContent } from './generator/zodSchemaCodeGenerator'; // ANPASSEN
import type { ZodCodeGeneratorOptions } from './generator/zodSchemaCodeGenerator'; // ANPASSEN

// 4. tRPC Code Generator und Setup importieren
import { generateTrpcRouterFileContent } from './generator/trpcRouterCodeGenerator'; // ANPASSEN
import type { TrpcCodeGeneratorOptions } from './generator/trpcRouterCodeGenerator'; // ANPASSEN
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { createContext, t as trpcInstance } from './server/trpc'; // Import t as trpcInstance to avoid conflict
import { connectDb } from './db'; // Import connectDb

// Definiere den AppRouter Typ basierend auf einer (ggf. leeren) Router-Definition,
// um sicherzustellen, dass er nicht 'undefined' ist.
// const _appRouterPlaceholder = trpcInstance.router({}); // Platzhalter für die Typinferenz // VERALTET
// export type AppRouter = typeof _appRouterPlaceholder; // VERALTET

// Die tatsächliche Router-Instanz wird später in main() zugewiesen.
// let appRouterInstance: AppRouter; // VERALTET

// =============================================================================
// Konfiguration für Generatoren (Pfade relativ zum Output-Verzeichnis)
// =============================================================================
const outputBaseDir = path.join(import.meta.dirname, 'generated');
const drizzleOutputDir = path.join(outputBaseDir, 'drizzle');
const zodOutputDir = path.join(outputBaseDir, 'zod');
const trpcOutputDir = path.join(outputBaseDir, 'trpc');

// KORREKTUR: Erstelle Output-Verzeichnisse
// Diese Verzeichnisse sollten idealerweise einmalig beim Setup erstellt werden
// oder Teil eines dedizierten Build-Skripts sein.
// Für den Moment lassen wir sie hier, aber bedenke, dass dies bei jedem
// Import von index.ts ausgeführt wird, wenn es nicht in einer Funktion gekapselt ist.
function ensureOutputDirectories() {
	if (!fs.existsSync(drizzleOutputDir)) {
		fs.mkdirSync(drizzleOutputDir, { recursive: true });
	}
	if (!fs.existsSync(zodOutputDir)) {
		fs.mkdirSync(zodOutputDir, { recursive: true });
	}
	if (!fs.existsSync(trpcOutputDir)) {
		fs.mkdirSync(trpcOutputDir, { recursive: true });
	}
	console.log(`✅ Output-Verzeichnisse sichergestellt: ${outputBaseDir}`);
}
ensureOutputDirectories(); // Call it once

const zodGenOptions: ZodCodeGeneratorOptions = {
	locales: ['en', 'de'], // Beispiel-Locales
	defaultLocale: 'en',
};

const trpcGenOptions: TrpcCodeGeneratorOptions = {
	// Pfade müssen relativ von der Zieldatei (im trpc-Ordner) sein
	trpcSetupPath: '../../server/trpc', // Pfad von generated/trpc/xxx.router.ts zu trpc.ts (Beispiel angepasst!)
	zodSchemaDir: '../zod', // Pfad von generated/trpc/ zu generated/zod/
	drizzleSchemaDir: '../drizzle', // Pfad von generated/trpc/ zu generated/drizzle/
	contextTypeName: 'Context', // Name deines tRPC Context Typs
};


// =============================================================================
// SCHRITT 1: Content Types definieren
// =============================================================================
console.log('\n--- 1. Definiere Content Types ---');
// (Definitionen bleiben gleich)
const userContentType = ContentTypeBuilder.create({
	apiId: "user",
	name: "Benutzer",
	displayField: "email",
	timestamps: true,
	softDelete: false,
	fields: [
		FieldBuilder.id({ options: { strategy: "uuid" } }),
		FieldBuilder.text({ apiId: "email", name: "E-Mail" }, { unique: true }),
	],
});
const tagContentType = ContentTypeBuilder.create({
	apiId: "tag",
	name: "Tag",
	displayField: "name",
	timestamps: false,
	softDelete: false,
	fields: [
		FieldBuilder.id({ options: { strategy: "cuid" } }),
		FieldBuilder.text({ apiId: "name", name: "Name" }, { unique: true }),
	],
});
const blogPostContentType = ContentTypeBuilder.create({
	apiId: "blogPost",
	name: "Blogbeitrag",
	description: "Ein Artikel.",
	displayField: "title",
	icon: "pencil-alt",
	timestamps: true,
	softDelete: false,
	fields: [
		FieldBuilder.id({ options: { strategy: "uuid" } }),
		FieldBuilder.text(
			{ apiId: "title", name: "Titel" },
			{
				localized: true,
				required: true,
				options: { maxLength: 120 },
				sortable: true,
				filterable: true,
				indexed: true,
			}
		),
		FieldBuilder.slug({ apiId: "slug", name: "URL-Slug" }),
		FieldBuilder.richText(
			{ apiId: "content", name: "Inhalt" },
			{ localized: true, required: true }
		),
		FieldBuilder.media({ apiId: "featuredImage", name: "Titelbild" }),
		FieldBuilder.boolean(
			{ apiId: "isPublished", name: "Veröffentlicht" },
			{
				options: { displayAs: "switch" },
				defaultValue: false,
				filterable: true,
				indexed: true,
			}
		),
		FieldBuilder.date(
			{ apiId: "publishedAt", name: "Veröffentlichungsdatum" },
			{
				required: false,
				options: { variant: "datetime" },
				sortable: true,
			}
		),
		FieldBuilder.relation(
			{ apiId: "author", name: "Autor" },
			{
				required: true,
				options: {
					relatedContentTypeApiId: "user",
					relationType: "many-to-one",
					onDelete: "SET NULL",
				},
			}
		),
		FieldBuilder.relation(
			{ apiId: "tags", name: "Tags" },
			{
				required: false,
				options: {
					relatedContentTypeApiId: "tag",
					relationType: "many-to-many",
				},
			}
		),
	],
});
export const allDefinitions = [
	userContentType,
	tagContentType,
	blogPostContentType,
];
// console.log(`✅ ${allDefinitions.length} Content Types definiert.`); // Optional: Kann in runCodeGeneration

function runCodeGeneration() {
	console.log('Starting code generation...');
	console.log(`✅ ${allDefinitions.length} Content Types definiert.`); // Moved here

	// =============================================================================
	// SCHRITT 2: Drizzle Schema Code generieren (Build-Schritt)
	// =============================================================================
	console.log('\n--- 2. Generiere Drizzle Schema Code ---');
	const generatedDrizzleFiles: string[] = []; // Store generated filenames
	const generatedJoinFiles = new Set<string>();
	for (const definition of allDefinitions) {
		try {
			const result = generateDrizzleSchemaFileContent(definition, allDefinitions);
			const mainSchemaFileName = `${_.snakeCase(definition.apiId)}.schema.ts`;
			const mainSchemaPath = path.join(drizzleOutputDir, mainSchemaFileName);
			console.log(`   Generiere Code für ${mainSchemaFileName}...`);
			fs.writeFileSync(mainSchemaPath, result.mainSchemaContent, 'utf-8'); // Schreibe Datei
			console.log(`   -> ${mainSchemaPath}`);
			generatedDrizzleFiles.push(mainSchemaFileName); // Add filename to list

			for (const joinSchemaInfo of result.joinSchemaContents) {
				const joinSchemaPath = path.join(drizzleOutputDir, joinSchemaInfo.fileName);
				if (!generatedJoinFiles.has(joinSchemaInfo.fileName)) {
					console.log(`   Generiere Code für ${joinSchemaInfo.fileName}...`);
					fs.writeFileSync(joinSchemaPath, joinSchemaInfo.content, 'utf-8'); // Schreibe Datei
					console.log(`   -> ${joinSchemaPath}`);
					generatedDrizzleFiles.push(joinSchemaInfo.fileName); // Add join table filename
					generatedJoinFiles.add(joinSchemaInfo.fileName);
				}
			}
		} catch (error) {
			console.error(`Fehler bei Drizzle-Generierung für ${definition.apiId}:`, error);
		}
	}

	// --- Generiere Drizzle Index-Datei ---
	if (generatedDrizzleFiles.length > 0) {
		const indexFileContent = `/**
 * GENERATED INDEX FILE - DO NOT EDIT MANUALLY!
 *
 * Re-exports all generated Drizzle schemas.
 */

${generatedDrizzleFiles.map(fileName => `export * as ${_.camelCase(fileName.replace('.schema.ts', ''))} from './${fileName.replace('.ts', '')}';`).join('\n')}
`;
		const indexFilePath = path.join(drizzleOutputDir, 'index.ts');
		console.log(`   Generiere Drizzle Index-Datei (index.ts)...`);
		fs.writeFileSync(indexFilePath, indexFileContent.trim() + '\n', 'utf-8');
		console.log(`   -> ${indexFilePath}`);
	}
	// --- Ende Drizzle Index-Datei Generierung ---

	console.log(`✅ Drizzle Schema Code Generierung abgeschlossen.`);

	// =============================================================================
	// SCHRITT 3: Zod Schema Code generieren (Build-Schritt)
	// =============================================================================
	console.log('\n--- 3. Generiere Zod Schema Code ---');
	const generatedZodFiles: string[] = []; // Store generated filenames

	for (const definition of allDefinitions) {
		try {
			const generatedCode = generateZodSchemaFileContent(
				definition,
				allDefinitions,
				zodGenOptions,
			);
			const outputFileName = `${_.camelCase(definition.apiId)}.schema.ts`;
			const outputPath = path.join(zodOutputDir, outputFileName);
			console.log(`   Generiere Code für ${outputFileName}...`);
			fs.writeFileSync(outputPath, generatedCode, 'utf-8'); // Schreibe Datei
			console.log(`   -> ${outputPath}`);
			generatedZodFiles.push(outputFileName); // Add filename to list
		} catch (error) {
			console.error(`Fehler bei Zod-Code-Generierung für ${definition.apiId}:`, error);
		}
	}

	// --- Generiere Zod Index-Datei ---
	if (generatedZodFiles.length > 0) {
		const indexFileContent = `/**
 * GENERATED INDEX FILE - DO NOT EDIT MANUALLY!
 *
 * Re-exports all generated Zod schemas.
 */

${generatedZodFiles.map(fileName => `export * as ${_.camelCase(fileName.replace('.schema.ts', ''))} from './${fileName.replace('.ts', '')}';`).join('\n')}
`;
		const indexFilePath = path.join(zodOutputDir, 'index.ts');
		console.log(`   Generiere Zod Index-Datei (index.ts)...`);
		fs.writeFileSync(indexFilePath, indexFileContent.trim() + '\n', 'utf-8');
		console.log(`   -> ${indexFilePath}`);
	}
	// --- Ende Zod Index-Datei Generierung ---

	console.log(`✅ Zod Schema Code Generierung abgeschlossen.`);


	// =============================================================================
	// SCHRITT 4: tRPC Router Code generieren (Build-Schritt)
	// =============================================================================
	console.log('\n--- 4. Generiere tRPC Router Code ---');
	const generatedTrpcFiles: string[] = []; // Store generated filenames
	for (const definition of allDefinitions) {
		try {
			const generatedCode = generateTrpcRouterFileContent(definition, trpcGenOptions);
			const outputFileName = `${_.camelCase(definition.apiId)}.router.ts`;
			const outputPath = path.join(trpcOutputDir, outputFileName);
			console.log(`   Generiere Code für ${outputFileName}...`);
			fs.writeFileSync(outputPath, generatedCode, 'utf-8'); // Schreibe Datei
			console.log(`   -> ${outputPath}`);
			generatedTrpcFiles.push(outputFileName); // Add filename to list
		} catch (error) {
			console.error(`Fehler bei tRPC Code-Generierung für ${definition.apiId}:`, error);
		}
	}

	// --- Generiere tRPC Index-Datei ---
	if (generatedTrpcFiles.length > 0) {
		// Dynamische Generierung der Index-Datei mit ES Modul Syntax
		const routerFiles = fs.readdirSync(trpcOutputDir)
			.filter(file => file.endsWith('.router.ts') && file !== 'index.ts');

		const importStatements = routerFiles.map(file => {
			const routerVariableName = _.camelCase(file.replace('.router.ts', '')); // e.g., user
			const routerExportNameInFile = `${routerVariableName}Router`; // e.g., userRouter, as generated by generateTrpcRouterFileContent
			// Import from .js as it will be at runtime after compilation
			return `import { ${routerExportNameInFile} } from './${file.replace('.ts', '.js')}';`;
		}).join('\n');

		const routerProperties = routerFiles.map(file => {
			const routerKeyName = _.camelCase(file.replace('.router.ts', '')); // e.g., user
			const routerExportNameInFile = `${routerKeyName}Router`; // e.g., userRouter
			return `  ${routerKeyName}: ${routerExportNameInFile},`;
		}).join('\n');

		const indexFileContent = `/**
 * GENERATED ES MODULE INDEX FILE - DO NOT EDIT MANUALLY!
 *
 * Exports all generated tRPC routers from this directory using ES module syntax.
 */
${importStatements}

const allRouters = {
${routerProperties}
};

export default allRouters;
`;
		const indexFilePath = path.join(trpcOutputDir, 'index.ts');
		console.log(`   Generiere ES Module tRPC Index-Datei (index.ts)...`);
		fs.writeFileSync(indexFilePath, indexFileContent.trim() + '\n', 'utf-8');
		console.log(`   -> ${indexFilePath}`);
	}
	// --- Ende tRPC Index-Datei Generierung ---

	console.log(`✅ tRPC Router Code Generierung abgeschlossen.`);
	console.log('Code generation finished.');

	// NEU: Generiere die Haupt-Server-Datei
	console.log('\n--- Generiere Haupt-Server-Datei (src/generated/server.ts) ---');
	const generatedServerContent = `
// File: src/generated/server.ts
// GENERATED FILE - DO NOT EDIT MANUALLY!

import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { createServer as createHttpServer } from 'http';
import { createContext, t as trpcInstance } from '../server/trpc';
import { connectDb } from '../db';
import * as allRoutersMap from './trpc/index'; // This imports all exports from index.ts into allRoutersMap
import { allDefinitions } from '../index'; // This imports all exports from index.ts into allRoutersMap

const appRouter = trpcInstance.router(allRoutersMap.default);

export type AppRouter = typeof appRouter;

export async function startServer(port: number = 4000) {
  await connectDb();

  const trpcHandler = createHTTPHandler({
	router: appRouter,
	createContext,
  });

  const httpServer = createHttpServer((req, res) => {
	if (req.url === '/' && req.method === 'GET') {
	  res.setHeader('Content-Type', 'application/json');
	  res.statusCode = 200;
	  if (allDefinitions) {
		res.end(JSON.stringify(allDefinitions));
	  } else {
		res.statusCode = 404;
		res.end(JSON.stringify({ error: "Die 'allDefinitions' konnten nicht im Modul './trpc/index' gefunden werden." }));
	  }
	} else {
	  trpcHandler(req, res);
	}
  });

  httpServer.listen(port, () => {
	console.log('🚀 tRPC server (generiert) läuft auf http://localhost:' + port);
	// Update the log message to reflect the new content at /
	console.log('Schema JSON (allDefinitions) available at http://localhost:' + port + '/');
  });
}
`;
	const generatedServerPath = path.join(outputBaseDir, 'server.ts');
	const newContentData = generatedServerContent.trim() + '\n';

	// Read the existing file content
	let existingContentData = '';
	if (fs.existsSync(generatedServerPath)) {
		existingContentData = fs.readFileSync(generatedServerPath, 'utf-8');
	}
	// Check if the content is different
	if (existingContentData.trim() !== newContentData.trim()) {
		fs.writeFileSync(generatedServerPath, newContentData, 'utf-8');
		console.log(`   -> ${generatedServerPath}`);
		// Ende Generierung Haupt-Server-Datei
	}
}

// FÜHRE DIE GENERIERUNG NICHT AUTOMATISCH AUS, WENN DIE DATEI IMPORTIERT WIRD
// runCodeGeneration(); // <--- Diese Zeile auskommentieren oder entfernen für normalen Serverstart

// =============================================================================
// SCHRITT 5: Server starten (via generierter Datei)
// =============================================================================

async function initializeApp() {
	// Optional: Führe die Generierung hier aus, wenn sie bei jedem Start laufen soll
	// oder stelle sicher, dass sie vorher gelaufen ist (z.B. durch ein separates Build-Skript).
	// Für die Entwicklung kann es nützlich sein, sie hier zu lassen, wenn sich Definitionen oft ändern.
	runCodeGeneration(); // Ensure this is called to generate files before import

	console.log('\n--- Initialisiere und starte den generierten Server ---');
	try {
		const { startServer } = await import('./generated/server');
		await startServer();
	} catch (error) {
		console.error('Fehler beim Starten des generierten Servers:', error);
		console.error('Stelle sicher, dass die Codegenerierung (runCodeGeneration()) erfolgreich ausgeführt wurde und die Datei src/generated/server.js existiert.');
		process.exit(1);
	}
}

// Nur ausführen, wenn das Skript direkt gestartet wird
// process.argv[1] is the path of the executed script.
// import.meta.url is the URL of the current module file.
if (process.argv[1] && import.meta.url === url.pathToFileURL(path.resolve(process.argv[1])).href) {
	initializeApp().catch(err => {
		console.error("Fehler beim Initialisieren der Anwendung:", err);
		process.exit(1);
	});
}

// AppRouter type should be imported from ./generated/server by the client, not re-exported here.
