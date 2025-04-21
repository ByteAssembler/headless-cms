// src/db/schema-relations.ts

// Fix: Import necessary types from drizzle-orm and sqlite-core
import { relations, type Relation, type Relations } from 'drizzle-orm';
import type { AnySQLiteTable, AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { FieldDefinition, RelationFieldDefinition } from './content-fields.js'; // Keep .js extension if needed for your module system

// Platzhalter-Typen - Diese müssen durch deine tatsächlichen Typen ersetzt werden,
// sobald du die Struktur für ContentTypeConfig hast.
export interface PlaceholderContentTypeConfig {
	apiIdentifier: string;
	fields: Record<string, FieldDefinition<any, any, any, any>>;
}

type AllTableObjects = Record<string, AnySQLiteTable>;
type AllContentTypeConfigs = Record<string, PlaceholderContentTypeConfig>; // z.B. { posts: postsConfig, authors: authorsConfig }

// Fix: Define a type for the expected structure of tables (assuming 'id' column)
type TableWithId = AnySQLiteTable & {
	id: AnySQLiteColumn;
};

/**
 * Generiert die Drizzle `relations`-Objekte für alle Content-Typen.
 *
 * @param allTables - Ein Objekt, das alle generierten Drizzle-Tabellenobjekte enthält (Schlüssel ist der apiIdentifier).
 * @param allConfigs - Ein Objekt, das die Konfigurationen aller Content-Typen enthält (Schlüssel ist der apiIdentifier).
 * @returns Ein Objekt, das die generierten Drizzle `relations`-Objekte enthält.
 */
// Fix: Adjust return type to represent a map of Relations objects
export function defineAllDrizzleRelations(
	allTables: AllTableObjects,
	allConfigs: AllContentTypeConfigs
): Record<string, Relations<string>> { // Return type is Record<string, Relations<string>>

	// Fix: Adjust type of allRelations
	const allRelations: Record<string, Relations<string>> = {};

	// Iteriere durch jede Content-Typ-Konfiguration
	for (const apiIdentifier in allConfigs) {
		const config = allConfigs[apiIdentifier];
		const currentTable = allTables[apiIdentifier] as TableWithId | undefined; // Cast to TableWithId

		if (!currentTable) {
			console.warn(`[defineAllDrizzleRelations] Tabelle für ${apiIdentifier} nicht gefunden.`);
			continue;
		}

		// Erzeuge das finale relations-Objekt für die aktuelle Tabelle
		// Use the relations helper correctly with a callback
		const generatedRelations = relations(currentTable, ({ one, many }) => {
			const relationDefinitions: Record<string, Relation<string>> = {}; // Collect definitions inside callback

			// Iteriere durch die Felder dieses Content-Typs
			for (const fieldName in config.fields) {
				const field = config.fields[fieldName] as FieldDefinition<any, any, any, any>; // Cast für Typzugriff

				// Prüfe, ob es eine Relations-Definition ist
				if (field.config && 'relationTo' in field.config && 'many' in field.config) {
					const relationConfig = field.config as RelationFieldDefinition['config'];
					const targetApiIdentifier = relationConfig.relationTo;
					const targetTable = allTables[targetApiIdentifier] as TableWithId | undefined; // Cast to TableWithId

					if (!targetTable) {
						console.warn(`[defineAllDrizzleRelations] Ziel-Tabelle ${targetApiIdentifier} für Relation ${apiIdentifier}.${fieldName} nicht gefunden.`);
						continue;
					}

					if (relationConfig.many) {
						// --- Many-Relation (*-to-many) ---
						const joinTableName = [apiIdentifier, targetApiIdentifier].sort().join('_to_');
						const joinTable = allTables[joinTableName];

						if (joinTable) {
							// Many-to-Many: Use the 'many' helper from the callback
							relationDefinitions[fieldName] = many(joinTable);
						} else {
							// One-to-Many: Use the 'many' helper from the callback
							relationDefinitions[fieldName] = many(targetTable);
						}

					} else {
						// --- One-Relation (*-to-one) ---
						const fkColumnName = `${fieldName}Id`;
						// Fix: Ensure fkColumn is treated as a column type
						const fkColumn = currentTable[fkColumnName as keyof typeof currentTable] as AnySQLiteColumn | undefined;

						if (!fkColumn) {
							console.warn(`[defineAllDrizzleRelations] Fremdschlüssel-Spalte ${fkColumnName} in Tabelle ${apiIdentifier} für Relation ${fieldName} nicht gefunden.`);
							continue;
						}

						// Use the 'one' helper from the callback
						relationDefinitions[fieldName] = one(targetTable, {
							fields: [fkColumn],
							// Fix: Access id column safely on targetTable (casted to TableWithId)
							references: [targetTable.id],
						});
					}
				}
			}
			return relationDefinitions; // Return collected definitions
		});

		// Only add if relations were actually defined
		if (Object.keys(generatedRelations).length > 0) {
			// Fix: Assign the generated Relations object correctly
			allRelations[apiIdentifier + 'Relations'] = generatedRelations;
		}
	}


	// --- Ergänzung: Relationen für Join-Tabellen ---
	for (const tableName in allTables) {
		const parts = tableName.split('_to_');
		if (parts.length === 2 && allConfigs[parts[0]] && allConfigs[parts[1]]) {
			const tableAIdentifier = parts[0];
			const tableBIdentifier = parts[1];
			const joinTable = allTables[tableName];
			const tableA = allTables[tableAIdentifier] as TableWithId | undefined; // Cast to TableWithId
			const tableB = allTables[tableBIdentifier] as TableWithId | undefined; // Cast to TableWithId

			if (joinTable && tableA && tableB) {
				// Fix: Ensure fkColumnA and fkColumnB are treated as column types
				const fkColumnA = joinTable[tableAIdentifier + 'Id' as keyof typeof joinTable] as AnySQLiteColumn | undefined;
				const fkColumnB = joinTable[tableBIdentifier + 'Id' as keyof typeof joinTable] as AnySQLiteColumn | undefined;

				if (fkColumnA && fkColumnB) {
					// Fix: Assign the generated Relations object correctly
					allRelations[tableName + 'Relations'] = relations(joinTable, ({ one }) => ({
						[tableAIdentifier]: one(tableA, {
							fields: [fkColumnA],
							// Fix: Access id column safely on tableA
							references: [tableA.id],
						}),
						[tableBIdentifier]: one(tableB, {
							fields: [fkColumnB],
							// Fix: Access id column safely on tableB
							references: [tableB.id],
						}),
					}));
				} else {
					console.warn(`[defineAllDrizzleRelations] Fremdschlüssel in Join-Tabelle ${tableName} nicht gefunden.`);
				}
			}
		}
	}


	return allRelations;
}

// ... (Verwendung example unchanged) ...