import { sqliteTable, text, primaryKey, type AnySQLiteColumn, type AnySQLiteTable, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core';
import { defineIdField, defineTimestamps, type FieldDefinition } from '../core/content-fields';
import { allContentTypeConfigs, type ContentTypeConfig } from '../content-types'; // Import allContentTypeConfigs here for type usage if needed, but it will be passed as an argument
import { defineAllDrizzleRelations } from '../core/schema-relations';
import type { Relations } from 'drizzle-orm';

// Define expected input type more explicitly
type AllContentTypeConfigs = typeof allContentTypeConfigs;

// Define return types
type TableWithId = AnySQLiteTable & { id: AnySQLiteColumn };
export type AllTables = Record<string, AnySQLiteTable>; // Export for generator
export type AllGeneratedRelations = Record<string, Relations<string, Record<string, any>>>; // Export for generator

export interface SchemaComponents {
	allTables: AllTables;
	allGeneratedRelations: AllGeneratedRelations;
}

/**
 * Generates Drizzle table and relation objects based on content type configurations.
 * @param configs - The collection of all content type configurations.
 * @returns An object containing the generated tables and relations.
 */
export function generateDrizzleSchemaComponents(configs: AllContentTypeConfigs): SchemaComponents {
	type ColumnsMap = Record<string, SQLiteColumnBuilderBase>;
	const allTables: AllTables = {};
	const manyToManyRelations: { fromTable: string, toTable: string }[] = [];

	console.log("Generating base tables...");

	for (const apiIdentifier in configs) {
		const config = configs[apiIdentifier];
		const drizzleColumns: ColumnsMap = {
			id: defineIdField().column,
			createdAt: defineTimestamps().createdAt.column,
			updatedAt: defineTimestamps().updatedAt.column,
		};

		for (const fieldName in config.fields) {
			const field = config.fields[fieldName] as FieldDefinition<any, any, any, any>;
			if (field.column) {
				let columnName = fieldName;
				// Handle one-to-many relation fields (foreign key column)
				if (field.config && 'relationTo' in field.config && !field.config.many) {
					// Use the field name + 'Id' convention for the foreign key column
					columnName = `${fieldName}Id`;
				}
				// Add the column definition to the map
				drizzleColumns[columnName] = field.column;
			} else if (field.config && 'relationTo' in field.config && field.config.many) {
				// Register many-to-many relations to create join tables later
				manyToManyRelations.push({ fromTable: apiIdentifier, toTable: field.config.relationTo });
			}
		}

		allTables[apiIdentifier] = sqliteTable(apiIdentifier, drizzleColumns);
		console.log(`  Created base table: ${apiIdentifier}`);
	}

	console.log("Generating join tables...");
	const createdJoinTables = new Set<string>();

	for (const m2m of manyToManyRelations) {
		const [tableA, tableB] = [m2m.fromTable, m2m.toTable].sort();
		const joinTableName = `${tableA}_to_${tableB}`;

		if (createdJoinTables.has(joinTableName)) {
			continue;
		}

		const tableAIdColumn = (allTables[tableA] as TableWithId | undefined)?.id;
		const tableBIdColumn = (allTables[tableB] as TableWithId | undefined)?.id;

		if (!tableAIdColumn || !tableBIdColumn) {
			console.error(`Could not find ID columns for join table ${joinTableName} between ${tableA} and ${tableB}`);
			continue;
		}

		// Define columns for the join table
		const joinTableColumns = {
			[`${tableA}Id`]: text(`${tableA}Id`).notNull().references(() => tableAIdColumn),
			[`${tableB}Id`]: text(`${tableB}Id`).notNull().references(() => tableBIdColumn),
		};

		// Create the join table
		allTables[joinTableName] = sqliteTable(joinTableName, joinTableColumns, (table) => ({
			pk: primaryKey({ columns: [table[`${tableA}Id`], table[`${tableB}Id`]] }),
		}));
		createdJoinTables.add(joinTableName);
		console.log(`  Created join table: ${joinTableName}`);
	}

	console.log("Defining relations...");
	const allGeneratedRelations = defineAllDrizzleRelations(allTables, configs);
	console.log("  Relations defined.");

	return { allTables, allGeneratedRelations };
}
