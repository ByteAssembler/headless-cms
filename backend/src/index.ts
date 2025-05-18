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

import * as fs from 'node:fs';
import * as path from 'node:path';
import _ from 'lodash';

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
import { initTRPC } from '@trpc/server';
import * as trpcRouters from './generated/trpc'; // Import generated tRPC routers
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { createContext } from './server/trpc'; // Import createContext

// Importiere t nur für den letzten Schritt (App Router Assembly Simulation)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { connectDb } from './db';

// =============================================================================
// Konfiguration für Generatoren (Pfade relativ zum Output-Verzeichnis)
// =============================================================================
const outputBaseDir = path.join(import.meta.dirname, 'generated');
const drizzleOutputDir = path.join(outputBaseDir, 'drizzle');
const zodOutputDir = path.join(outputBaseDir, 'zod');
const trpcOutputDir = path.join(outputBaseDir, 'trpc');

// KORREKTUR: Erstelle Output-Verzeichnisse
fs.mkdirSync(drizzleOutputDir, { recursive: true });
fs.mkdirSync(zodOutputDir, { recursive: true });
fs.mkdirSync(trpcOutputDir, { recursive: true });
console.log(`✅ Output-Verzeichnisse sichergestellt: ${outputBaseDir}`);


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
console.log(`✅ ${allDefinitions.length} Content Types definiert.`);


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
	const indexFileContent = `/**
 * GENERATED INDEX FILE - DO NOT EDIT MANUALLY!
 *
 * Re-exports all generated tRPC routers.
 */

${generatedTrpcFiles.map(fileName => `export * as ${_.camelCase(fileName.replace('.router.ts', ''))} from './${fileName.replace('.ts', '')}';`).join('\n')}
`;
	const indexFilePath = path.join(trpcOutputDir, 'index.ts');
	console.log(`   Generiere tRPC Index-Datei (index.ts)...`);
	fs.writeFileSync(indexFilePath, indexFileContent.trim() + '\n', 'utf-8');
	console.log(`   -> ${indexFilePath}`);
}
// --- Ende tRPC Index-Datei Generierung ---

console.log(`✅ tRPC Router Code Generierung abgeschlossen.`);


// =============================================================================
// SCHRITT 5: Build-Prozess abschließen
// =============================================================================
console.log('\n--- 5. Build-Prozess Ende ---');
console.log('   Nächste Schritte wären:');
console.log('   1. Alle generierten *.ts Dateien mit `tsc` kompilieren.');
console.log('   2. Drizzle Migrationen mit `drizzle-kit generate:pg` (oder ähnlich) erstellen.');
console.log('   3. Drizzle Migrationen mit `drizzle-kit push:pg` (oder DB-Client) anwenden.');

// Initialize tRPC
const t = initTRPC.context<typeof createContext>().create();
const appRouter = t.router({
	user: trpcRouters.user.userRouter,
	tag: trpcRouters.tag.tagRouter,
	blogPost: trpcRouters.blogPost.blogPostRouter,
	// Add other routers here
});

export type AppRouter = typeof appRouter;

async function startServer() {
	await connectDb();

	const t = initTRPC.context<typeof createContext>().create();
	const appRouter = t.router({
		user: trpcRouters.user.userRouter,
		tag: trpcRouters.tag.tagRouter,
		blogPost: trpcRouters.blogPost.blogPostRouter,
		// Add other routers here
	});

	const httpServer = createHTTPServer({
		router: appRouter,
		createContext, // createContext might need to be async now
	});

	httpServer.listen(4000);
	console.log('tRPC server läuft auf http://localhost:4000');
}

startServer().catch(console.error);
