import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(import.meta.dirname, '../.env') });

// src/db.ts
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
// Import all schema modules from the generated index file
import * as allGeneratedSchemaModules from './generated/drizzle';

// Ensure your DATABASE_URL is in your .env file or configured here
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL environment variable is not set.');
}

const client = new Client({ connectionString });

export async function connectDb() {
	try {
		await client.connect();

		await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";') // Enable UUID extension if needed

		console.log('Database connected successfully.');
	} catch (error) {
		console.error('Database connection failed:', error);
		process.exit(1); // Exit if DB connection fails
	}
}

// Construct the combined schema object that Drizzle expects.
const combinedSchema: Record<string, any> = {}; // Add type annotation to combinedSchema

for (const moduleKey in allGeneratedSchemaModules) {
	if (Object.prototype.hasOwnProperty.call(allGeneratedSchemaModules, moduleKey)) {
		const schemaModule = (allGeneratedSchemaModules as any)[moduleKey]; // Use type assertion
		if (schemaModule && typeof schemaModule === 'object') {
			for (const exportKey in schemaModule) {
				if (Object.prototype.hasOwnProperty.call(schemaModule, exportKey)) {
					combinedSchema[exportKey] = (schemaModule as any)[exportKey]; // Use type assertion
				}
			}
		}
	}
}

export const db: NodePgDatabase<typeof combinedSchema> = drizzle(client, { schema: combinedSchema });

export async function disconnectDb() {
	await client.end();
	console.log('Database disconnected.');
}
