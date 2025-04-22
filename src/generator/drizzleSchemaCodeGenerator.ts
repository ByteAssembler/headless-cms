/**
 * drizzleSchemaCodeGenerator.ts
 *
 * Generiert TypeScript-Code (als String) für eine Drizzle ORM-Schema-Datei (PostgreSQL)
 * basierend auf einer ContentTypeDefinition.
 * Erzeugt Tabellen-, Join-Tabellen- und Relations-Definitionen.
 */

import type {
	ContentTypeDefinition,
	FieldDefinition,
	TextField,
	NumberField,
	DateField,
	RelationField,
	BooleanField,
	JsonField,
	MediaField,
	RichTextField,
	IdField,
	ForeignKeyAction,
} from '../fields/types'; // Annahme: Typen sind in types.ts
import _ from 'lodash'; // Für _.snakeCase, _.camelCase, _.upperFirst

// =============================================================================
// Hilfsfunktionen (unverändert)
// =============================================================================

function toSnakeCase(str: string): string {
	return _.snakeCase(str);
}

function toCamelCase(str: string): string {
	return _.camelCase(str);
}

function formatDefaultValueForDrizzle(
	value: any,
	fieldType: FieldDefinition['fieldType']
): string {
	if (value === undefined || value === null) return '';
	if (fieldType === 'date' && value === 'now') {
		return `.default(sql\`CURRENT_TIMESTAMP\`)`;
	}
	if (fieldType === 'boolean') return `.default(${value})`;
	if (fieldType === 'number') return `.default(${value})`;
	if (typeof value === 'string') {
		const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "''");
		return `.default('${escapedValue}')`;
	}
	if (typeof value === 'object') {
		try {
			const jsonString = JSON.stringify(value);
			const escapedJsonString = jsonString
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "''");
			return `.default(sql\`${escapedJsonString}\`::jsonb)`;
		} catch (e) {
			console.warn(`Konnte Default-Objekt nicht für Drizzle serialisieren: ${e}`);
			return '';
		}
	}
	console.warn(
		`Default-Wert-Formatierung für Typ "${fieldType}" nicht vollständig implementiert: ${value}`
	);
	return '';
}

function getIdTsType(definition: ContentTypeDefinition | undefined): 'string' | 'number' {
	const idField = definition?.fields.find((f) => f.fieldType === 'id') as
		| IdField
		| undefined;
	if (!idField) return 'string';
	return idField.options.strategy === 'autoincrement' ? 'number' : 'string';
}

function getIdDrizzleCoreType(
	definition: ContentTypeDefinition | undefined
): 'uuid' | 'integer' | 'text' {
	const idField = definition?.fields.find((f) => f.fieldType === 'id') as
		| IdField
		| undefined;
	if (!idField) return 'text';
	switch (idField.options.strategy) {
		case 'uuid':
			return 'uuid';
		case 'autoincrement':
			return 'integer';
		case 'cuid':
			return 'text';
		default:
			return 'text';
	}
}

function getDrizzleColumnDefinitionString(
	field: FieldDefinition,
	allDefinitions: ContentTypeDefinition[]
): { propertyName: string; code: string } | null {
	const propertyName = toCamelCase(field.apiId);
	const columnName = toSnakeCase(field.apiId);
	let typeString: string;
	let owningPropertyName = propertyName;

	if (field.localized) {
		typeString = `pgCore.jsonb('${columnName}')`;
	} else {
		switch (field.fieldType) {
			case 'id':
				const idStrategy = (field as IdField).options.strategy;
				if (idStrategy === 'uuid') typeString = `pgCore.uuid('${columnName}')`;
				else if (idStrategy === 'autoincrement')
					typeString = `pgCore.serial('${columnName}')`;
				else typeString = `pgCore.text('${columnName}')`; // CUID
				typeString += '.primaryKey()';
				return { propertyName, code: `${propertyName}: ${typeString}` };

			case 'text':
			case 'richtext':
				typeString = `pgCore.text('${columnName}')`;
				break;

			case 'number':
				const numVariant = (field as NumberField).options.variant;
				if (numVariant === 'integer') typeString = `pgCore.integer('${columnName}')`;
				else typeString = `pgCore.real('${columnName}')`;
				break;

			case 'boolean':
				typeString = `pgCore.boolean('${columnName}')`;
				break;

			case 'date':
				const dateVariant = (field as DateField).options.variant;
				const timestampOptions = `{ withTimezone: true, mode: 'date' }`;
				if (dateVariant === 'dateonly')
					typeString = `pgCore.date('${columnName}', { mode: 'date' })`;
				else typeString = `pgCore.timestamp('${columnName}', ${timestampOptions})`;
				break;

			case 'relation':
				const relField = field as RelationField;
				const relType = relField.options.relationType;
				if (relType === 'many-to-one' || relType === 'one-to-one') {
					const relatedContentType = allDefinitions.find(
						(def) => def.apiId === relField.options.relatedContentTypeApiId
					);
					if (!relatedContentType)
						throw new Error(
							`[Generator Error] Relation target "${relField.options.relatedContentTypeApiId}" not found for field "${field.apiId}".`
						);

					const relatedIdCoreType = getIdDrizzleCoreType(relatedContentType);
					const relatedTableName = toSnakeCase(relatedContentType.apiId);
					const fkColumnName = toSnakeCase(field.apiId) + '_id';
					owningPropertyName = toCamelCase(fkColumnName);

					typeString = `pgCore.${relatedIdCoreType}('${fkColumnName}')`;
					let references = `.references(() => ${relatedTableName}.id`;
					let actions = '';
					if (relField.options.onDelete)
						actions += `, onDelete: '${relField.options.onDelete.toLowerCase()}'`;
					if (relField.options.onUpdate)
						actions += `, onUpdate: '${relField.options.onUpdate.toLowerCase()}'`;
					if (actions) references += `, { ${actions.substring(2)} }`;
					references += `)`;
					typeString += references;
				} else {
					return null;
				}
				break;

			case 'media':
				typeString = `pgCore.text('${columnName}')`;
				break;

			case 'json':
				typeString = `pgCore.jsonb('${columnName}')`;
				break;

			default:
				const _exhaustiveCheck: never = field;
				const unknownType = (_exhaustiveCheck as any)?.fieldType || 'unknown';
				throw new Error(
					`[Generator Error] Unimplemented field type encountered in getDrizzleColumnDefinitionString: ${unknownType}`
				);
		}
	}

	if (field.required) typeString += '.notNull()';
	const defaultValueString = formatDefaultValueForDrizzle(
		field.defaultValue,
		field.fieldType
	);
	if (defaultValueString) typeString += defaultValueString;
	if (field.unique) typeString += '.unique()';

	return { propertyName: owningPropertyName, code: `${owningPropertyName}: ${typeString}` };
}

// =============================================================================
// Hauptgenerator-Funktion
// =============================================================================

export interface drizzleSchemaCodeGeneratorResult {
	mainSchemaContent: string;
	joinSchemaContents: { fileName: string; content: string }[];
}

export function generateDrizzleSchemaFileContent(
	definition: ContentTypeDefinition,
	allDefinitions: ContentTypeDefinition[]
): drizzleSchemaCodeGeneratorResult {
	const { apiId: typeApiId, name: typeName, timestamps, softDelete, fields } =
		definition;
	const tableName = toSnakeCase(typeApiId);

	const requiredImports = new Set<string>([
		"import { sql } from 'drizzle-orm';",
		"import { relations } from 'drizzle-orm';",
		"import { pgTable, primaryKey, index } from 'drizzle-orm/pg-core';",
		"import * as pgCore from 'drizzle-orm/pg-core';",
	]);
	const columnDefinitionLines: string[] = [];
	const indexDefinitionStrings: string[] = [];
	const relationDefinitionStrings: string[] = [];
	const joinSchemaContents: { fileName: string; content: string }[] = [];
	const joinTableImports = new Set<string>();
	const fieldPropertyNames = new Map<string, string>();

	// --- Generiere Spalten für Haupttabelle ---
	for (const field of fields) {
		const colDefResult = getDrizzleColumnDefinitionString(field, allDefinitions);
		if (colDefResult) {
			columnDefinitionLines.push(colDefResult.code);
			fieldPropertyNames.set(field.apiId, colDefResult.propertyName);

			if (field.indexed && !field.unique) {
				const columnName = toSnakeCase(field.apiId);
				const indexName = `${tableName}_${columnName}_idx`;
				indexDefinitionStrings.push(
					`  index('${indexName}').on(table.${colDefResult.propertyName})`
				);
			}
		}

		// --- M:N Join-Tabelle vorbereiten ---
		if (
			field.fieldType === 'relation' &&
			(field as RelationField).options.relationType === 'many-to-many'
		) {
			const relField = field as RelationField;
			const relatedContentType = allDefinitions.find(
				(def) => def.apiId === relField.options.relatedContentTypeApiId
			);
			if (!relatedContentType)
				throw new Error(
					`[Generator Error] Relation target ${relField.options.relatedContentTypeApiId} not found for M:N field ${field.apiId}.`
				);
			const ownIdField = definition.fields.find((f) => f.fieldType === 'id');
			if (!ownIdField)
				throw new Error(
					`[Generator Error] Own Content Type ${definition.apiId} has no ID field for M:N relation.`
				);

			const relatedTableNameSnake = toSnakeCase(relatedContentType.apiId);
			const ownTableNameSnake = tableName;
			const tableNames = [ownTableNameSnake, relatedTableNameSnake].sort();
			const joinTableName = `${tableNames[0]}_to_${tableNames[1]}`;
			const joinSchemaFileName = `${joinTableName}.schema.ts`;
			const joinTableCamelCase = toCamelCase(joinTableName);

			joinTableImports.add(
				`import { ${joinTableName}, ${joinTableCamelCase}Relations } from './${joinSchemaFileName.replace(
					'.ts',
					''
				)}';`
			);
			relationDefinitionStrings.push(`  ${toCamelCase(field.apiId)}: many(${joinTableName})`);

			// --- Join-Tabelle selbst generieren (nur einmal pro Paar) ---
			if (!joinSchemaContents.some((jt) => jt.fileName === joinSchemaFileName)) {
				const relatedIdCoreType = getIdDrizzleCoreType(relatedContentType);
				const ownIdCoreType = getIdDrizzleCoreType(definition);
				const ownFkColName = `${ownTableNameSnake}_id`;
				const relatedFkColName = `${relatedTableNameSnake}_id`;
				const ownTableImport = `import { ${ownTableNameSnake} } from './${ownTableNameSnake}.schema';`;
				const relatedTableImport = `import { ${relatedTableNameSnake} } from './${relatedTableNameSnake}.schema';`;

				const joinTableCode = `
/**
 * GENERATED BY drizzleSchemaCodeGenerator.ts - DO NOT EDIT MANUALLY!
 *
 * Join Table Schema for ${definition.name} <-> ${relatedContentType.name}
 * DB Table: ${joinTableName}
 */
import { relations } from 'drizzle-orm';
import { pgTable, primaryKey } from 'drizzle-orm/pg-core';
import * as pgCore from 'drizzle-orm/pg-core';
${ownTableImport}
${relatedTableImport}

export const ${joinTableName} = pgTable('${joinTableName}', {
  ${ownFkColName}: pgCore.${ownIdCoreType}('${ownFkColName}').notNull().references(() => ${ownTableNameSnake}.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  ${relatedFkColName}: pgCore.${relatedIdCoreType}('${relatedFkColName}').notNull().references(() => ${relatedTableNameSnake}.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
}, (table) => ([
  primaryKey({ columns: [table.${ownFkColName}, table.${relatedFkColName}] }),
]));

// Relations for the join table
export const ${joinTableCamelCase}Relations = relations(${joinTableName}, ({ one }) => ({
  ${toCamelCase(ownTableNameSnake)}: one(${ownTableNameSnake}, { fields: [${joinTableName}.${ownFkColName}], references: [${ownTableNameSnake}.id] }),
  ${toCamelCase(relatedTableNameSnake)}: one(${relatedTableNameSnake}, { fields: [${joinTableName}.${relatedFkColName}], references: [${relatedTableNameSnake}.id] }),
}));
`;
				joinSchemaContents.push({
					fileName: joinSchemaFileName,
					content: joinTableCode.trim() + '\n',
				});
			}
		} else if (
			field.fieldType === 'relation' &&
			(field.options.relationType === 'many-to-one' ||
				field.options.relationType === 'one-to-one')
		) {
			const relField = field as RelationField;
			const relatedTableNameSnake = toSnakeCase(relField.options.relatedContentTypeApiId);
			const relatedTableSchemaFile = `./${relatedTableNameSnake}.schema`;
			const fkPropertyName =
				fieldPropertyNames.get(field.apiId) ??
				toCamelCase(toSnakeCase(field.apiId) + '_id');

			requiredImports.add(`import { ${relatedTableNameSnake} } from '${relatedTableSchemaFile}';`);
			relationDefinitionStrings.push(
				`  ${toCamelCase(field.apiId)}: one(${relatedTableNameSnake}, { fields: [${tableName}.${fkPropertyName}], references: [${relatedTableNameSnake}.id] })`
			);
		}
	} // Ende for fields

	// --- Generiere OneToMany Relationseinträge ---
	for (const otherDef of allDefinitions) {
		if (otherDef.apiId === definition.apiId) continue;
		for (const otherField of otherDef.fields) {
			if (otherField.fieldType === 'relation') {
				const otherRelField = otherField as RelationField;
				if (
					otherRelField.options.relatedContentTypeApiId === definition.apiId &&
					otherRelField.options.relationType === 'many-to-one'
				) {
					const otherTableNameSnake = toSnakeCase(otherDef.apiId);
					const otherTableSchemaFile = `./${otherTableNameSnake}.schema`;
					const manyRelationName = toCamelCase(otherDef.apiId) + 's';

					requiredImports.add(`import { ${otherTableNameSnake} } from '${otherTableSchemaFile}';`);
					relationDefinitionStrings.push(`  ${manyRelationName}: many(${otherTableNameSnake})`);
				}
			}
		}
	}

	// --- Timestamps und SoftDelete Spalten ---
	const timestampOptions = `{ withTimezone: true, mode: 'date' }`;
	if (timestamps) {
		columnDefinitionLines.push(
			`createdAt: pgCore.timestamp('created_at', ${timestampOptions}).notNull().defaultNow()`
		);
		columnDefinitionLines.push(
			`updatedAt: pgCore.timestamp('updated_at', ${timestampOptions}).notNull().defaultNow()`
		);
	}
	if (softDelete) {
		columnDefinitionLines.push(
			`deletedAt: pgCore.timestamp('deleted_at', ${timestampOptions})`
		);
	}

	// --- Hauptschema-Code zusammensetzen ---
	const importBlock = Array.from(requiredImports)
		.concat(Array.from(joinTableImports))
		.sort()
		.join('\n');

	let columnBlock = '';
	if (columnDefinitionLines.length > 0) {
		const firstCol = columnDefinitionLines[0];
		const restCols = columnDefinitionLines.slice(1);
		columnBlock = firstCol;
		if (restCols.length > 0) {
			columnBlock += `,\n${restCols.map((line) => `  ${line}`).join(',\n')}`;
		}
		// KORREKTUR: Trailing Komma nur wenn nötig oder immer für Git? Hier erstmal nur wenn Extras folgen
		// columnBlock += ','; // Entfernt für den Fall, dass keine Extras folgen
	}

	const tableExtrasBlock =
		indexDefinitionStrings.length > 0
			? ` (table) => ([\n${indexDefinitionStrings.join(
				',\n' // Komma zwischen Index-Einträgen
			)},\n])` // Trailing Komma innerhalb des Arrays
			: '';

	const closingBraceComma = tableExtrasBlock ? ',' : '';


	const relationsBlock =
		relationDefinitionStrings.length > 0
			? `\n${relationDefinitionStrings.join(',\n')},\n` // Trailing comma
			: '';

	const mainSchemaContent = `
/**
 * GENERATED BY drizzleSchemaCodeGenerator.ts - DO NOT EDIT MANUALLY!
 *
 * Schema for Content Type: ${typeName} (${typeApiId})
 * DB Table: ${tableName}
 */
${importBlock}

export const ${tableName} = pgTable('${tableName}', {
  ${columnBlock}
}${closingBraceComma}${tableExtrasBlock});

// Define relations for the ${tableName} table
export const ${toCamelCase(tableName)}Relations = relations(${tableName}, ({ one, many }) => ({${relationsBlock}}));
`;

	return {
		mainSchemaContent: mainSchemaContent.trim() + '\n',
		joinSchemaContents: joinSchemaContents,
	};
}

// =============================================================================
// Beispielhafte Verwendung (unverändert, da Logik jetzt im Generator liegt)
// =============================================================================
/*
import * as fs from 'fs';
import * as path from 'path';
import { ContentTypeBuilder, FieldBuilder } from './definitionBuilder'; // Annahme: Builder existiert

// --- Beispieldefinitionen (vereinfacht) ---
const userContentType = ContentTypeBuilder.create({
	apiId: 'user', name: 'Benutzer', displayField: 'email', timestamps: true, softDelete: false,
	fields: [ FieldBuilder.id({ options: { strategy: 'uuid' } }), FieldBuilder.text({ apiId: 'email', name: 'E-Mail' }, { unique: true }) ]
});
const tagContentType = ContentTypeBuilder.create({
	apiId: 'tag', name: 'Tag', displayField: 'name', timestamps: false, softDelete: false,
	fields: [ FieldBuilder.id({ options: { strategy: 'cuid' } }), FieldBuilder.text({ apiId: 'name', name: 'Name' }, { unique: true }) ]
});
const blogPostContentType = ContentTypeBuilder.create({
	apiId: 'blogPost', name: 'Blogbeitrag', description: 'Ein Artikel.', displayField: 'title', icon: 'pencil-alt', timestamps: true, softDelete: false,
	fields: [
		FieldBuilder.id({ options: { strategy: 'uuid' } }),
		FieldBuilder.text({ apiId: 'title', name: 'Titel' }, { localized: true, required: true, options: { maxLength: 120 }, sortable: true, filterable: true, indexed: true }),
		FieldBuilder.slug({ apiId: 'slug', name: 'URL-Slug' }),
		FieldBuilder.richText({ apiId: 'content', name: 'Inhalt' }, { localized: true, required: true }),
		FieldBuilder.media({ apiId: 'featuredImage', name: 'Titelbild' }),
		FieldBuilder.boolean({ apiId: 'isPublished', name: 'Veröffentlicht' }, { options: { displayAs: 'switch' }, defaultValue: false, filterable: true, indexed: true }),
		FieldBuilder.date({ apiId: 'publishedAt', name: 'Veröffentlichungsdatum' }, { required: false, options: { variant: 'datetime' }, sortable: true }),
		FieldBuilder.relation({ apiId: 'author', name: 'Autor' }, { required: true, options: { relatedContentTypeApiId: 'user', relationType: 'many-to-one', onDelete: 'SET NULL' } }),
		FieldBuilder.relation({ apiId: 'tags', name: 'Tags' }, { required: false, options: { relatedContentTypeApiId: 'tag', relationType: 'many-to-many' } }),
	]
});


const allDefinitions = [userContentType, tagContentType, blogPostContentType];

// --- Code für jede Definition generieren und schreiben ---
const outputBaseDir = path.join(__dirname, 'generated', 'drizzle');
fs.mkdirSync(outputBaseDir, { recursive: true });

const generatedJoinFiles = new Set<string>(); // Verhindert doppeltes Schreiben

for (const definition of allDefinitions) {
	try {
		const result = generateDrizzleSchemaFileContent(definition, allDefinitions);
		const mainSchemaFileName = `${toSnakeCase(definition.apiId)}.schema.ts`;
		const mainSchemaPath = path.join(outputBaseDir, mainSchemaFileName);

		console.log(`--- Generierter Code für ${mainSchemaFileName} ---`);
		console.log(result.mainSchemaContent);
		fs.writeFileSync(mainSchemaPath, result.mainSchemaContent, 'utf-8');
		console.log(`✅ Drizzle-Hauptschema geschrieben nach: ${mainSchemaPath}`);

		// Join-Tabellen schreiben (wenn vorhanden)
		for (const joinSchemaInfo of result.joinSchemaContents) {
			const joinSchemaPath = path.join(outputBaseDir, joinSchemaInfo.fileName);

			if (!generatedJoinFiles.has(joinSchemaInfo.fileName)) {
				console.log(`--- Generierter Code für ${joinSchemaInfo.fileName} ---`);
				console.log(joinSchemaInfo.content);
				fs.writeFileSync(joinSchemaPath, joinSchemaInfo.content, 'utf-8');
				console.log(`✅ Drizzle-Join-Schema geschrieben nach: ${joinSchemaPath}`);
				generatedJoinFiles.add(joinSchemaInfo.fileName); // Markieren als geschrieben
			} else {
				console.log(`ℹ️ Drizzle-Join-Schema ${joinSchemaInfo.fileName} wurde bereits von anderer Seite generiert, übersprungen.`);
			}
		}

	} catch (error) {
		console.error(`Fehler bei der Drizzle-Code-Generierung für ${definition.apiId}:`, error);
	}
}
*/