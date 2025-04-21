import { z } from 'zod';
import {
	text,
	integer,
	real,
	blob,
	type SQLiteColumnBuilderBase,
	type SQLiteTextBuilderInitial,
	type SQLiteIntegerBuilderInitial,
	type SQLiteRealBuilderInitial,
	type SQLiteBlobJsonBuilderInitial,
	type SQLiteTextBuilder,
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

// --- Base types and interfaces ---

// Possible UI widgets (extendable)
type UiWidget =
	| 'text'
	| 'textarea'
	| 'richtext'
	| 'number'
	| 'checkbox'
	| 'switch'
	| 'datetime'
	| 'select'
	| 'radio'
	| 'json'
	| 'slug'
	| 'relationPicker';

/** General options for almost every field */
interface BaseFieldOptions {
	label?: string;
	required?: boolean;
	description?: string;
	uiWidget?: UiWidget;
	dbDefaultValue?: any;
}

/** Result object of a define function */
export type FieldDefinition<
	TName extends string = string,
	TZodSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TColumnBuilder extends SQLiteColumnBuilderBase | null = SQLiteColumnBuilderBase | null,
	TConfig extends BaseFieldOptions = BaseFieldOptions & { uiWidget?: UiWidget, dbDefaultValue?: any }
> = {
	_type: 'fieldDefinition';
	name: TName;
	schema: TZodSchema;
	column: TColumnBuilder;
	config: TConfig & { label: string; required: boolean; uiWidget?: UiWidget; dbDefaultValue?: any };
};

// --- Helper for label generation ---
function getLabel(name: string, label?: string): string {
	return label ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
}

// --- Field definition functions ---

/**
 * Defines a simple text field (VARCHAR/TEXT in DB).
 */
export function defineTextField<TName extends string>(
	name: TName,
	options: BaseFieldOptions & {
		unique?: boolean;
		minLength?: number;
		maxLength?: number;
		defaultValue?: string;
		uiWidget?: 'text' | 'textarea' | 'richtext';
		dbDefaultValue?: string;
	} = {}
): FieldDefinition<
	TName,
	z.ZodString | z.ZodOptional<z.ZodNullable<z.ZodString>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>,
	SQLiteColumnBuilderBase,
	typeof resolvedConfig
> {
	const {
		required = false,
		unique = false,
		minLength,
		maxLength,
		defaultValue,
		dbDefaultValue,
		uiWidget = 'text',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);

	let zodSchema: z.ZodString = z.string();
	if (minLength !== undefined) zodSchema = zodSchema.min(minLength, { message: `${label} must be at least ${minLength} characters long` });
	if (maxLength !== undefined) zodSchema = zodSchema.max(maxLength, { message: `${label} must be at most ${maxLength} characters long` });

	let finalZodSchema: z.ZodString | z.ZodOptional<z.ZodNullable<z.ZodString>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
	if (required) {
		finalZodSchema = zodSchema.min(minLength ?? 1, { message: `${label} is required` });
	} else {
		let optionalSchema = zodSchema.nullable().optional();
		if (defaultValue !== undefined) {
			finalZodSchema = optionalSchema.default(defaultValue);
		} else {
			finalZodSchema = optionalSchema;
		}
	}

	let drizzleColumn = text(name);
	if (required) drizzleColumn = drizzleColumn.notNull();
	if (unique) drizzleColumn = drizzleColumn.unique();
	if (dbDefaultValue !== undefined) {
		drizzleColumn = drizzleColumn.default(dbDefaultValue);
	}

	const resolvedConfig = { ...baseOptions, label, required, unique, minLength, maxLength, defaultValue, dbDefaultValue, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

/**
 * Defines a boolean field (usually as INTEGER 0/1 in SQLite).
 */
export function defineBooleanField<TName extends string>(
	name: TName,
	options: BaseFieldOptions & {
		defaultValue?: boolean;
		uiWidget?: 'checkbox' | 'switch';
	} = {}
): FieldDefinition<TName, z.ZodDefault<z.ZodBoolean>, SQLiteColumnBuilderBase, typeof resolvedConfig> {
	const {
		defaultValue = false,
		required = true,
		uiWidget = 'checkbox',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);

	const zodSchema = z.boolean().default(defaultValue);

	const drizzleColumn = integer(name, { mode: 'boolean' })
		.notNull()
		.default(defaultValue);

	const resolvedConfig = { ...baseOptions, label, required, defaultValue, uiWidget, dbDefaultValue: defaultValue };

	return {
		_type: 'fieldDefinition',
		name,
		schema: zodSchema,
		column: drizzleColumn,
		config: resolvedConfig,
	};
}

/**
 * Defines a slug field (text, unique, required, with regex).
 */
export function defineSlugField<TName extends string>(
	name: TName,
	options: BaseFieldOptions & {
		sourceField: string;
	}
): FieldDefinition<TName, z.ZodString, SQLiteColumnBuilderBase, typeof resolvedConfig & { uiWidget: 'slug' }> {
	const {
		sourceField,
		required = true,
		...baseOptions
	} = options;
	if (!required) {
		console.warn(`Slug field '${name}' was set to not required. This is unusual.`);
	}
	const label = getLabel(name, baseOptions.label ?? 'Slug');
	const uiWidget: UiWidget = 'slug';

	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
	const zodSchema = z.string()
		.min(1, { message: `${label} is required` })
		.regex(slugRegex, { message: `Invalid ${label} format (e.g., 'my-first-post')` });

	const drizzleColumn = text(name)
		.notNull()
		.unique();

	const resolvedConfig = { ...baseOptions, label, required, unique: true, sourceField, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: zodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

/**
 * Defines a JSON field.
 */
export function defineJsonField<TName extends string, TJsonSchema extends z.ZodTypeAny = z.ZodUnknown>(
	name: TName,
	options: BaseFieldOptions & {
		jsonSchema?: TJsonSchema;
		defaultValue?: z.infer<TJsonSchema>;
		dbDefaultValue?: any;
	} = {}
): FieldDefinition<
	TName,
	TJsonSchema | z.ZodOptional<z.ZodNullable<TJsonSchema>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<TJsonSchema>>>,
	SQLiteColumnBuilderBase,
	typeof resolvedConfig & { uiWidget: 'json' }
> {
	const {
		required = false,
		jsonSchema = z.unknown() as unknown as TJsonSchema,
		defaultValue,
		dbDefaultValue,
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);
	const uiWidget: UiWidget = 'json';

	let finalZodSchema: TJsonSchema | z.ZodOptional<z.ZodNullable<TJsonSchema>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<TJsonSchema>>>;
	if (required) {
		finalZodSchema = jsonSchema;
	} else {
		let optionalSchema = jsonSchema.nullable().optional();
		if (defaultValue !== undefined) {
			finalZodSchema = optionalSchema.default(defaultValue);
		} else {
			finalZodSchema = optionalSchema;
		}
	}

	let drizzleColumn = blob(name, { mode: 'json' }) as SQLiteBlobJsonBuilderInitial<z.infer<TJsonSchema>>;
	if (required) {
		drizzleColumn = drizzleColumn.notNull();
	}
	if (dbDefaultValue !== undefined) {
		drizzleColumn = drizzleColumn.default(dbDefaultValue);
	}

	const resolvedConfig = { ...baseOptions, label, required, jsonSchema, defaultValue, dbDefaultValue, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

// --- New field definition functions ---

/**
 * Defines a number field (INTEGER or REAL).
 */
export function defineNumberField<TName extends string>(
	name: TName,
	options: BaseFieldOptions & {
		type?: 'integer' | 'real';
		min?: number;
		max?: number;
		unique?: boolean;
		defaultValue?: number;
		dbDefaultValue?: number;
		uiWidget?: 'number';
	} = {}
): FieldDefinition<
	TName,
	z.ZodNumber | z.ZodOptional<z.ZodNullable<z.ZodNumber>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>,
	SQLiteColumnBuilderBase,
	typeof resolvedConfig
> {
	const {
		required = false,
		type = 'integer',
		min,
		max,
		unique = false,
		defaultValue,
		dbDefaultValue,
		uiWidget = 'number',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);

	let zodSchema: z.ZodNumber = z.number();
	if (type === 'integer') zodSchema = zodSchema.int({ message: `${label} must be an integer` });
	if (min !== undefined) zodSchema = zodSchema.min(min, { message: `${label} must be at least ${min}` });
	if (max !== undefined) zodSchema = zodSchema.max(max, { message: `${label} must be at most ${max}` });

	let finalZodSchema: z.ZodNumber | z.ZodOptional<z.ZodNullable<z.ZodNumber>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
	if (required) {
		finalZodSchema = zodSchema;
	} else {
		let optionalSchema = zodSchema.nullable().optional();
		if (defaultValue !== undefined) {
			finalZodSchema = optionalSchema.default(defaultValue);
		} else {
			finalZodSchema = optionalSchema;
		}
	}

	let drizzleColumn: SQLiteIntegerBuilderInitial<any> | SQLiteRealBuilderInitial<any>;
	if (type === 'integer') {
		drizzleColumn = integer(name);
	} else {
		drizzleColumn = real(name);
	}

	if (required) drizzleColumn = drizzleColumn.notNull();
	if (unique) drizzleColumn = drizzleColumn.unique();
	if (dbDefaultValue !== undefined) {
		drizzleColumn = drizzleColumn.default(dbDefaultValue);
	}

	const resolvedConfig = { ...baseOptions, label, required, type, min, max, unique, defaultValue, dbDefaultValue, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

/**
 * Defines a date/time field.
 */
export function defineDateTimeField<TName extends string>(
	name: TName,
	options: BaseFieldOptions & {
		defaultValue?: Date;
		dbDefaultValue?: Date | 'CURRENT_TIMESTAMP';
		uiWidget?: 'datetime';
	} = {}
): FieldDefinition<
	TName,
	z.ZodDate | z.ZodOptional<z.ZodNullable<z.ZodDate>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodDate>>>,
	SQLiteColumnBuilderBase,
	typeof resolvedConfig
> {
	const {
		required = false,
		defaultValue,
		dbDefaultValue,
		uiWidget = 'datetime',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);

	let zodSchema: z.ZodDate = z.date({ message: `Invalid date for ${label}` });

	let finalZodSchema: z.ZodDate | z.ZodOptional<z.ZodNullable<z.ZodDate>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
	if (required) {
		finalZodSchema = zodSchema;
	} else {
		let optionalSchema = zodSchema.nullable().optional();
		if (defaultValue !== undefined) {
			finalZodSchema = optionalSchema.default(defaultValue);
		} else {
			finalZodSchema = optionalSchema;
		}
	}

	let drizzleColumn = integer(name, { mode: 'timestamp_ms' });

	if (required) drizzleColumn = drizzleColumn.notNull();
	if (dbDefaultValue !== undefined) {
		if (dbDefaultValue === 'CURRENT_TIMESTAMP') {
			drizzleColumn = drizzleColumn.$defaultFn(() => new Date());
		} else if (dbDefaultValue instanceof Date) {
			drizzleColumn = drizzleColumn.default(dbDefaultValue);
		}
	}

	const resolvedConfig = { ...baseOptions, label, required, defaultValue, dbDefaultValue, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

/**
 * Defines a select (enum) field.
 */
export function defineSelectField<
	TName extends string,
	TOptions extends [string, ...string[]]
>(
	name: TName,
	options: BaseFieldOptions & {
		options: TOptions | Readonly<TOptions>;
		defaultValue?: TOptions[number];
		dbDefaultValue?: TOptions[number];
		uiWidget?: 'select' | 'radio';
	}
): FieldDefinition<
	TName,
	z.ZodEnum<TOptions> | z.ZodOptional<z.ZodNullable<z.ZodEnum<TOptions>>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodEnum<TOptions>>>>,
	SQLiteColumnBuilderBase,
	typeof resolvedConfig
> {
	const {
		required = false,
		options: selectOptionsInput,
		defaultValue,
		dbDefaultValue,
		uiWidget = 'select',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);
	const selectOptions = [...selectOptionsInput] as TOptions;

	let zodSchema: z.ZodEnum<TOptions> = z.enum(selectOptions);

	let finalZodSchema: z.ZodEnum<TOptions> | z.ZodOptional<z.ZodNullable<z.ZodEnum<TOptions>>> | z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodEnum<TOptions>>>>;
	if (required) {
		finalZodSchema = zodSchema;
	} else {
		let optionalSchema = zodSchema.nullable().optional();
		if (defaultValue !== undefined) {
			finalZodSchema = optionalSchema.default(defaultValue);
		} else {
			finalZodSchema = optionalSchema;
		}
	}

	let drizzleColumn = text(name, { enum: selectOptions });

	if (required) drizzleColumn = drizzleColumn.notNull();
	if (dbDefaultValue !== undefined) {
		drizzleColumn = drizzleColumn.default(dbDefaultValue);
	}

	const resolvedConfig = { ...baseOptions, label, required, options: selectOptions, defaultValue, dbDefaultValue, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema,
		column: drizzleColumn as SQLiteColumnBuilderBase,
		config: resolvedConfig,
	};
}

// Additional options for relation fields
interface RelationFieldOptions extends BaseFieldOptions {
	relationTo: string;
	many: boolean;
	uiWidget?: 'select' | 'relationPicker';
}

// Result type for relation fields, must include relationTo and many
export type RelationFieldDefinition<
	TName extends string = string,
	TZodSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TConfig extends RelationFieldOptions = RelationFieldOptions
> = FieldDefinition<TName, TZodSchema, SQLiteColumnBuilderBase | null, TConfig & { relationTo: string; many: boolean }>;

/**
 * Defines a relation field.
 * IMPORTANT: Only creates the Zod definition and, if many:false, the foreign key column.
 * The actual Drizzle `relations()` definition must be done separately!
 */
export function defineRelationField<TName extends string>(
	name: TName,
	options: RelationFieldOptions
): RelationFieldDefinition<
	TName,
	| z.ZodString | z.ZodOptional<z.ZodNullable<z.ZodString>>
	| z.ZodArray<z.ZodString> | z.ZodOptional<z.ZodArray<z.ZodString>>,
	typeof resolvedConfig
> {
	const {
		relationTo,
		many,
		required = false,
		uiWidget = 'select',
		...baseOptions
	} = options;
	const label = getLabel(name, baseOptions.label);

	let finalZodSchema:
		| z.ZodString | z.ZodOptional<z.ZodNullable<z.ZodString>>
		| z.ZodArray<z.ZodString> | z.ZodOptional<z.ZodArray<z.ZodString>>;

	let drizzleColumnBuilder: SQLiteColumnBuilderBase | null = null;
	const fkColumnName = `${name}Id`;

	if (many) {
		const arraySchema = z.array(z.string().cuid2());
		finalZodSchema = required ? arraySchema.min(1) : arraySchema.optional();
		drizzleColumnBuilder = null;
	} else {
		const idSchema = z.string().cuid2();
		finalZodSchema = required ? idSchema : idSchema.nullable().optional();
		let specificBuilder = text(fkColumnName);
		if (required) {
			specificBuilder = specificBuilder.notNull();
		}
		drizzleColumnBuilder = specificBuilder;
	}

	const resolvedConfig = { ...baseOptions, label, required, relationTo, many, uiWidget };

	return {
		_type: 'fieldDefinition',
		name,
		schema: finalZodSchema as (
			| z.ZodString | z.ZodOptional<z.ZodNullable<z.ZodString>>
			| z.ZodArray<z.ZodString> | z.ZodOptional<z.ZodArray<z.ZodString>>
		),
		column: drizzleColumnBuilder as SQLiteColumnBuilderBase | null,
		config: resolvedConfig,
	};
}

// --- Example for ID and timestamps ---

/**
 * Defines an ID field (CUID2).
 */
export function defineIdField(name: string = 'id') {
	return {
		_type: 'fieldDefinition' as const,
		name,
		schema: z.string().cuid2(),
		column: text(name).primaryKey().$defaultFn(() => createId()),
		config: { label: 'ID', required: true },
	};
}

/**
 * Defines createdAt and updatedAt timestamp fields.
 */
export function defineTimestamps() {
	const now = () => new Date();
	return {
		createdAt: {
			_type: 'fieldDefinition' as const,
			name: 'createdAt',
			schema: z.date(),
			column: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
			config: { label: 'Created At', required: true, uiWidget: 'datetime' as UiWidget },
		},
		updatedAt: {
			_type: 'fieldDefinition' as const,
			name: 'updatedAt',
			schema: z.date(),
			column: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now).$onUpdate(now),
			config: { label: 'Updated At', required: true, uiWidget: 'datetime' as UiWidget },
		}
	};
}
