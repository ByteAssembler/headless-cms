// src/db/schema-relations.ts

import { relations, type Relation, type Relations } from 'drizzle-orm';
import type { AnySQLiteTable, AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { FieldDefinition, RelationFieldDefinition } from './content-fields';

// Placeholder types - Replace with your actual types once you have the structure for ContentTypeConfig.
export interface PlaceholderContentTypeConfig {
	apiIdentifier: string;
	fields: Record<string, FieldDefinition<any, any, any, any>>;
}

type AllTableObjects = Record<string, AnySQLiteTable>;
type AllContentTypeConfigs = Record<string, PlaceholderContentTypeConfig>;

type TableWithId = AnySQLiteTable & {
	id: AnySQLiteColumn;
};

/**
 * Generates Drizzle `relations` objects for all content types.
 *
 * @param allTables - An object containing all generated Drizzle table objects (keyed by apiIdentifier).
 * @param allConfigs - An object containing the configuration of all content types (keyed by apiIdentifier).
 * @returns An object containing the generated Drizzle `relations` objects.
 */
export function defineAllDrizzleRelations(
	allTables: AllTableObjects,
	allConfigs: AllContentTypeConfigs
): Record<string, Relations<string>> {
	const allRelations: Record<string, Relations<string>> = {};

	for (const apiIdentifier in allConfigs) {
		const config = allConfigs[apiIdentifier];
		const currentTable = allTables[apiIdentifier] as TableWithId | undefined;

		if (!currentTable) {
			console.warn(`[defineAllDrizzleRelations] Table for ${apiIdentifier} not found.`);
			continue;
		}

		const generatedRelations = relations(currentTable, ({ one, many }) => {
			const relationDefinitions: Record<string, Relation<string>> = {};

			for (const fieldName in config.fields) {
				const field = config.fields[fieldName] as FieldDefinition<any, any, any, any>;

				if (field.config && 'relationTo' in field.config && 'many' in field.config) {
					const relationConfig = field.config as RelationFieldDefinition['config'];
					const targetApiIdentifier = relationConfig.relationTo;
					const targetTable = allTables[targetApiIdentifier] as TableWithId | undefined;

					if (!targetTable) {
						console.warn(`[defineAllDrizzleRelations] Target table ${targetApiIdentifier} for relation ${apiIdentifier}.${fieldName} not found.`);
						continue;
					}

					if (relationConfig.many) {
						// Many-to-Many or One-to-Many
						const joinTableName = [apiIdentifier, targetApiIdentifier].sort().join('_to_');
						const joinTable = allTables[joinTableName];

						if (joinTable) {
							// Many-to-Many
							relationDefinitions[fieldName] = many(joinTable);
						} else {
							// One-to-Many
							relationDefinitions[fieldName] = many(targetTable);
						}
					} else {
						// Many-to-One
						const fkColumnName = `${fieldName}Id`;
						const fkColumn = currentTable[fkColumnName as keyof typeof currentTable] as AnySQLiteColumn | undefined;

						if (!fkColumn) {
							console.warn(`[defineAllDrizzleRelations] Foreign key column ${fkColumnName} in table ${apiIdentifier} for relation ${fieldName} not found.`);
							continue;
						}

						relationDefinitions[fieldName] = one(targetTable, {
							fields: [fkColumn],
							references: [targetTable.id],
						});
					}
				}
			}
			return relationDefinitions;
		});

		if (Object.keys(generatedRelations).length > 0) {
			allRelations[apiIdentifier + 'Relations'] = generatedRelations;
		}
	}

	// Add relations for join tables
	for (const tableName in allTables) {
		const parts = tableName.split('_to_');
		if (parts.length === 2 && allConfigs[parts[0]] && allConfigs[parts[1]]) {
			const tableAIdentifier = parts[0];
			const tableBIdentifier = parts[1];
			const joinTable = allTables[tableName];
			const tableA = allTables[tableAIdentifier] as TableWithId | undefined;
			const tableB = allTables[tableBIdentifier] as TableWithId | undefined;

			if (joinTable && tableA && tableB) {
				const fkColumnA = joinTable[tableAIdentifier + 'Id' as keyof typeof joinTable] as AnySQLiteColumn | undefined;
				const fkColumnB = joinTable[tableBIdentifier + 'Id' as keyof typeof joinTable] as AnySQLiteColumn | undefined;

				if (fkColumnA && fkColumnB) {
					allRelations[tableName + 'Relations'] = relations(joinTable, ({ one }) => ({
						[tableAIdentifier]: one(tableA, {
							fields: [fkColumnA],
							references: [tableA.id],
						}),
						[tableBIdentifier]: one(tableB, {
							fields: [fkColumnB],
							references: [tableB.id],
						}),
					}));
				} else {
					console.warn(`[defineAllDrizzleRelations] Foreign key(s) in join table ${tableName} not found.`);
				}
			}
		}
	}

	return allRelations;
}
