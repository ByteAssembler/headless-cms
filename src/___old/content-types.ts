import {
    defineTextField,
    defineBooleanField,
    defineDateTimeField,
    defineNumberField,
    defineRelationField,
    defineSlugField,
    type FieldDefinition,
    defineSelectField,
    defineTimestamps
} from '@/old/core/content-fields';

// Definiere die Struktur für eine Content-Typ-Konfiguration
// (Ersetzt PlaceholderContentTypeConfig aus schema-relations.ts)
export interface ContentTypeConfig {
    apiIdentifier: string;
    fields: Record<string, FieldDefinition<any, any, any, any>>;
}

// --- Auth Schema Definitions ---

export const usersConfig: ContentTypeConfig = {
    apiIdentifier: 'users', // Geändert von 'user' zu 'users' für Konsistenz mit Schema
    fields: {
        name: defineTextField('name', { required: true }),
        email: defineTextField('email', { required: true, unique: true }),
        emailVerified: defineBooleanField('emailVerified', { defaultValue: false }),
        image: defineTextField('image', { required: false }),
        role: defineSelectField('role', {
            options: [
                "admin",
                "client",
                "user",
            ],
            defaultValue: 'user',
            uiWidget: 'select'
        }),
        ...defineTimestamps()
    }
};

export const sessionConfig: ContentTypeConfig = {
    apiIdentifier: 'session',
    fields: {
        expiresAt: defineDateTimeField('expiresAt', { required: true }),
        token: defineTextField('token', { required: true, unique: true }),
        ipAddress: defineTextField('ipAddress', { required: false }),
        userAgent: defineTextField('userAgent', { required: false }),
        user: defineRelationField('user', {
            relationTo: 'users', // Geändert von 'user' zu 'users' für Konsistenz
            many: false,
            required: true
        }),
        ...defineTimestamps()
    }
};

export const accountConfig: ContentTypeConfig = {
    apiIdentifier: 'account',
    fields: {
        accountId: defineTextField('accountId', { required: true }),
        providerId: defineTextField('providerId', { required: true }),
        user: defineRelationField('user', {
            relationTo: 'users', // Geändert von 'user' zu 'users' für Konsistenz
            many: false,
            required: true
        }),
        accessToken: defineTextField('accessToken', { required: false }),
        refreshToken: defineTextField('refreshToken', { required: false }),
        idToken: defineTextField('idToken', { required: false }),
        accessTokenExpiresAt: defineDateTimeField('accessTokenExpiresAt', { required: false }),
        refreshTokenExpiresAt: defineDateTimeField('refreshTokenExpiresAt', { required: false }),
        scope: defineTextField('scope', { required: false }),
        password: defineTextField('password', { required: false }),
        // Standard timestamps are automatically added in schema.ts
        ...defineTimestamps()
    }
};

export const verificationConfig: ContentTypeConfig = {
    apiIdentifier: 'verification',
    fields: {
        identifier: defineTextField('identifier', { required: true }),
        value: defineTextField('value', { required: true }),
        expiresAt: defineDateTimeField('expiresAt', { required: true }),
        // Standard timestamps are automatically added in schema.ts
        ...defineTimestamps()
    }
};

// --- Definitionen der Content-Typen ---

export const postsConfig: ContentTypeConfig = {
    apiIdentifier: 'posts',
    fields: {
        title: defineTextField('title', { required: true }),
        slug: defineSlugField('slug', { sourceField: 'title' }),
        content: defineTextField('content', { uiWidget: 'textarea' }),
        publishedAt: defineDateTimeField('publishedAt', { required: false }),
        author: defineRelationField('author', { // M2O / FK
            relationTo: 'users', // Bleibt bei 'users', da authUserConfig jetzt korrekt auf 'users' verweist
            many: false,
            required: true, // Ein Post muss einen Autor haben
            uiWidget: 'relationPicker'
        }),
        categories: defineRelationField('categories', { // M2M
            relationTo: 'categories',
            many: true,
            required: false, // Ein Post kann keine Kategorien haben
            uiWidget: 'relationPicker'
        })
    }
};

export const categoriesConfig: ContentTypeConfig = {
    apiIdentifier: 'categories',
    fields: {
        name: defineTextField('name', { required: true }),
        // posts: M2M wird über Join-Tabelle definiert
    }
};

// --- Sammlung aller Konfigurationen ---

export const allContentTypeConfigs = {
    [usersConfig.apiIdentifier]: usersConfig,
    [postsConfig.apiIdentifier]: postsConfig,
    [categoriesConfig.apiIdentifier]: categoriesConfig,
    [sessionConfig.apiIdentifier]: sessionConfig,
    [accountConfig.apiIdentifier]: accountConfig,
    [verificationConfig.apiIdentifier]: verificationConfig
};
