/**
 * definitionBuilder.ts
 *
 * Stellt Helper-Funktionen (Builder) zur Verfügung, um ContentTypeDefinition
 * und FieldDefinition Objekte einfacher und konsistenter zu erstellen.
 * Nutzt Defaults, um die Definitionen zu verkürzen und die Lesbarkeit zu erhöhen.
 */

import _ from 'lodash'; // Oder spezifische Imports wie `import defaults from 'lodash/defaults';`
import type {
	BaseField,
	BooleanField,
	ContentTypeDefinition,
	DateField,
	FieldDefinition,
	FieldType,
	ForeignKeyAction,
	IdField,
	JsonField,
	MediaField,
	NumberField,
	RelationField,
	RichTextField,
	TextField,
} from './types'; // Annahme: Typen sind in types.ts

// =============================================================================
// Interne Hilfstypen für Builder-Optionen
// =============================================================================
// Diese Typen definieren, was der *Benutzer* dem Builder übergibt.
// Sie machen viele Eigenschaften optional, da Defaults gesetzt werden.

type BaseFieldUserOptions = Partial<Omit<BaseField, 'apiId' | 'name'>>; // apiId und name sind meist Pflicht

type IdFieldUserOptions = Partial<Pick<IdField, 'options' | 'description'>>; // Nur wenige Optionen sind sinnvoll

type TextFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<TextField['options']>;
};

type RichTextFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<RichTextField['options']>;
};

type NumberFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<NumberField['options']>;
};

type BooleanFieldUserOptions = BaseFieldUserOptions & {
	options: Partial<BooleanField['options']> & Pick<BooleanField['options'], 'displayAs'>; // displayAs sollte angegeben werden
};

type DateFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<DateField['options']>;
};

// Bei Relation sind relatedContentTypeApiId und relationType essenziell
type RelationFieldUserOptions = BaseFieldUserOptions & {
	options: Partial<RelationField['options']> & Pick<RelationField['options'], 'relatedContentTypeApiId' | 'relationType'>;
};

type MediaFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<MediaField['options']>;
};

type JsonFieldUserOptions = BaseFieldUserOptions & {
	options?: Partial<JsonField['options']>;
};


// =============================================================================
// Standardwerte für Felder
// =============================================================================

const BASE_FIELD_DEFAULTS: Omit<BaseField, 'apiId' | 'name' | 'fieldType' | 'defaultValue'> = {
	description: undefined,
	placeholder: undefined,
	required: true,
	unique: false,
	localized: false,
	hidden: false,
	showInListView: true, // Standardmäßig anzeigen
	creatable: true,
	updatable: true,
	filterable: false,
	sortable: false,
	indexed: false, // Wird bei unique:true oder ID überschrieben
};

const ID_FIELD_DEFAULTS: Omit<IdField, 'fieldType' | 'apiId' | 'name' | 'options'> = {
	description: 'Eindeutiger Identifikator',
	required: true,
	unique: true,
	localized: false,
	creatable: false,
	updatable: false,
	filterable: true,
	sortable: true,
	indexed: true,
	hidden: true,
	showInListView: false,
	defaultValue: undefined,
	placeholder: undefined,
};

const RELATION_OPTIONS_DEFAULTS: Pick<RelationField['options'], 'onDelete' | 'onUpdate' | 'displayWidget'> = {
	onDelete: 'NO ACTION', // Sicherster Default auf DB-Ebene
	onUpdate: 'NO ACTION',
	displayWidget: 'autocomplete', // Guter Kompromiss für viele Relationen
};

// =============================================================================
// FieldBuilder Objekt
// =============================================================================

/**
 * Stellt Factory-Funktionen für verschiedene Feldtypen bereit.
 */
export const FieldBuilder = {
	/**
	 * Erstellt eine standardmäßige ID-Felddefinition.
	 */
	id(userOptions?: IdFieldUserOptions): IdField {
		const options = _.defaults({}, userOptions?.options, { strategy: 'uuid' }); // Default ID-Strategie
		const base = _.defaults({}, userOptions, ID_FIELD_DEFAULTS);

		return {
			...base,
			apiId: 'id', // Feste Konvention
			name: 'ID',   // Feste Konvention
			fieldType: 'id',
			options: options,
		};
	},

	/**
	 * Erstellt eine Text-Felddefinition.
	 * @param requiredOptions - Muss `apiId` und `name` enthalten.
	 * @param userOptions - Optionale Überschreibungen und typspezifische Optionen.
	 */
	text(
		requiredOptions: Pick<TextField, 'apiId' | 'name'>,
		userOptions?: TextFieldUserOptions
	): TextField {
		const options = _.defaults({}, userOptions?.options, { variant: 'short' }); // Default: short text
		// Spezielle Defaults für Slug
		if (options.variant === 'slug') {
			_.defaults(userOptions, { unique: true, updatable: false, sortable: true, filterable: true, indexed: true });
			// Pattern für Slug ggf. hier defaulten?
		}

		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'text',
			options: options,
			indexed: base.indexed || base.unique, // Index für unique Felder setzen
		};
	},

	/**
	* Bequemer Helper für ein Slug-Feld.
	*/
	slug(
		requiredOptions: Pick<TextField, 'apiId' | 'name'>,
		userOptions?: Omit<TextFieldUserOptions, 'options'> & { options?: Omit<TextField['options'], 'variant'> }
	): TextField {
		const specificDefaults: Partial<TextFieldUserOptions> = {
			unique: true,
			updatable: false,
			sortable: true,
			filterable: true,
			indexed: true,
			required: true,
			placeholder: 'z.b. mein-toller-beitrag'
		};
		// Erlaube keine Variante-Änderung, setze sie fest
		const finalUserOptions = { ...userOptions, options: { ...userOptions?.options, variant: 'slug' as const } };
		const mergedOptions = _.defaults({}, finalUserOptions, specificDefaults);

		return FieldBuilder.text(requiredOptions, mergedOptions);
	},


	/**
	 * Erstellt eine RichText-Felddefinition.
	 */
	richText(
		requiredOptions: Pick<RichTextField, 'apiId' | 'name'>,
		userOptions?: RichTextFieldUserOptions
	): RichTextField {
		const options = _.defaults({}, userOptions?.options);
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'richtext',
			options: options,
		};
	},

	/**
	 * Erstellt eine Number-Felddefinition.
	 */
	number(
		requiredOptions: Pick<NumberField, 'apiId' | 'name'>,
		userOptions?: NumberFieldUserOptions
	): NumberField {
		const options = _.defaults({}, userOptions?.options, { variant: 'integer' }); // Default: integer
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'number',
			options: options,
			indexed: base.indexed || base.unique, // Index für unique Felder
		};
	},

	/**
	 * Erstellt eine Boolean-Felddefinition. `displayAs` ist in den Optionen erforderlich.
	 */
	boolean(
		requiredOptions: Pick<BooleanField, 'apiId' | 'name'>,
		userOptions: BooleanFieldUserOptions // Optionen hier nicht optional machen, da displayAs benötigt
	): BooleanField {
		// Keine spezifischen Options-Defaults für Boolean außer displayAs, das Pflicht ist
		const options = userOptions.options;
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		// Default für Boolean oft false, wenn required true ist
		if (base.required && base.defaultValue === undefined) {
			base.defaultValue = false;
		}


		return {
			...base,
			...requiredOptions,
			fieldType: 'boolean',
			options: options,
			indexed: base.indexed || base.unique, // Index für unique Felder
		};
	},

	/**
	 * Erstellt eine Date-Felddefinition.
	 */
	date(
		requiredOptions: Pick<DateField, 'apiId' | 'name'>,
		userOptions?: DateFieldUserOptions
	): DateField {
		const options = _.defaults({}, userOptions?.options, {
			variant: 'datetime', // Default: datetime
			allowFutureDates: true,
			allowPastDates: true
		});
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'date',
			options: options,
			indexed: base.indexed || base.unique, // Index für unique Felder
		};
	},

	/**
	* Erstellt eine Relation-Felddefinition. `relatedContentTypeApiId` und `relationType` sind in den Optionen erforderlich.
	*/
	relation(
		requiredOptions: Pick<RelationField, 'apiId' | 'name'>,
		userOptions: RelationFieldUserOptions // Optionen nicht optional, da Kerninfos benötigt
	): RelationField {
		const options = _.defaults({}, userOptions.options, RELATION_OPTIONS_DEFAULTS);
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		// Relationen sind oft filterbar/sortierbar nach der ID und sollten indiziert sein
		_.defaults(base, { filterable: true, sortable: true, indexed: true });

		return {
			...base,
			...requiredOptions,
			fieldType: 'relation',
			options: options,
			indexed: base.indexed || base.unique, // Index auch wenn unique
		};
	},

	/**
	 * Erstellt eine Media-Felddefinition.
	 */
	media(
		requiredOptions: Pick<MediaField, 'apiId' | 'name'>,
		userOptions?: MediaFieldUserOptions
	): MediaField {
		const options = _.defaults({}, userOptions?.options);
		// Media Felder sind oft nicht required
		const base = _.defaults({}, userOptions, { required: false }, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'media',
			options: options,
			// Media Felder selbst sind selten unique/indexed, die Referenz-ID darunter schon
		};
	},

	/**
	* Erstellt eine JSON-Felddefinition.
	*/
	json(
		requiredOptions: Pick<JsonField, 'apiId' | 'name'>,
		userOptions?: JsonFieldUserOptions
	): JsonField {
		const options = _.defaults({}, userOptions?.options);
		const base = _.defaults({}, userOptions, BASE_FIELD_DEFAULTS);

		return {
			...base,
			...requiredOptions,
			fieldType: 'json',
			options: options,
			// JSON Felder sind selten unique/indexed, außer man indexiert bestimmte Pfade (DB spezifisch)
		};
	},
};

// =============================================================================
// ContentTypeBuilder Objekt
// =============================================================================

/** Stellt Factory-Funktionen für Content Types bereit. */
export const ContentTypeBuilder = {
	/**
	 * Erstellt eine ContentTypeDefinition mit sinnvollen Defaults und Basisvalidierung.
	 * @param options - Konfiguration des Content Types. Muss `apiId`, `name`, `displayField` und `fields` enthalten.
	 */
	create(
		options: Pick<ContentTypeDefinition, 'apiId' | 'name' | 'displayField' | 'fields'>
			& Partial<Omit<ContentTypeDefinition, 'apiId' | 'name' | 'displayField' | 'fields'>>
	): ContentTypeDefinition {
		const contentTypeDefaults: Pick<ContentTypeDefinition, 'timestamps' | 'softDelete' | 'description' | 'icon'> = {
			timestamps: true, // Standardmäßig Timestamps aktivieren
			softDelete: false, // Standardmäßig kein Soft Delete
			description: undefined,
			icon: undefined,
		};

		const definition = _.defaults({}, options, contentTypeDefaults);

		// --- Basisvalidierungen ---
		if (!definition.apiId || !/^[a-z][a-zA-Z0-9_]*$/.test(definition.apiId)) {
			throw new Error(`ContentType apiId "${definition.apiId}" ist ungültig (muss mit Kleinbuchstabe starten, nur alphanumerisch + Underscore).`);
		}
		if (!definition.name) {
			throw new Error(`ContentType name darf nicht leer sein für apiId "${definition.apiId}".`);
		}
		if (!definition.displayField) {
			throw new Error(`ContentType displayField muss angegeben werden für apiId "${definition.apiId}".`);
		}

		// Prüfe Felder
		if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
			throw new Error(`ContentType fields Array darf nicht leer sein für apiId "${definition.apiId}".`);
		}

		const fieldApiIds = new Set<string>();
		let idFieldCount = 0;
		let displayFieldFound = false;

		for (const field of definition.fields) {
			if (!field || !field.apiId) {
				throw new Error(`Ungültiges Feld ohne apiId in ContentType "${definition.apiId}" gefunden.`);
			}
			if (!/^[a-z][a-zA-Z0-9_]*$/.test(field.apiId)) {
				throw new Error(`Feld apiId "${field.apiId}" in ContentType "${definition.apiId}" ist ungültig (muss mit Kleinbuchstabe starten, nur alphanumerisch + Underscore).`);
			}
			if (fieldApiIds.has(field.apiId)) {
				throw new Error(`Doppelte Feld apiId "${field.apiId}" in ContentType "${definition.apiId}" gefunden.`);
			}
			fieldApiIds.add(field.apiId);

			if (field.fieldType === 'id') {
				idFieldCount++;
				if (field.apiId !== 'id') {
					throw new Error(`Feld vom Typ 'id' muss die apiId 'id' haben (gefunden: "${JSON.stringify(field)}") in ContentType "${definition.apiId}".`);
				}
			}
			if (field.apiId === definition.displayField) {
				displayFieldFound = true;
				// Optional: Prüfen ob displayField ein sinnvoller Typ ist (z.B. text)
				if (field.fieldType !== 'text' && field.fieldType !== 'number' && field.fieldType !== 'date') {
					console.warn(`WARNUNG: displayField "${definition.displayField}" in ContentType "${definition.apiId}" hat einen ungewöhnlichen Typ (${field.fieldType}).`);
				}
			}
		}

		if (idFieldCount === 0) {
			throw new Error(`ContentType "${definition.apiId}" muss genau ein Feld vom Typ 'id' enthalten. Keines gefunden. Verwende FieldBuilder.id().`);
		}
		if (idFieldCount > 1) {
			throw new Error(`ContentType "${definition.apiId}" darf nur ein Feld vom Typ 'id' enthalten. ${idFieldCount} gefunden.`);
		}
		if (!displayFieldFound) {
			throw new Error(`Das angegebene displayField "${definition.displayField}" existiert nicht in den Feldern des ContentType "${definition.apiId}".`);
		}

		return definition;
	}
};
