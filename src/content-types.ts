import {
    defineTextField,
    defineBooleanField,
    defineDateTimeField,
    defineNumberField,
    defineRelationField,
    defineSlugField,
    type FieldDefinition
} from './core/content-fields';

// Definiere die Struktur für eine Content-Typ-Konfiguration
// (Ersetzt PlaceholderContentTypeConfig aus schema-relations.ts)
export interface ContentTypeConfig {
    apiIdentifier: string;
    fields: Record<string, FieldDefinition<any, any, any, any>>;
}

// --- Definitionen der Content-Typen ---

export const usersConfig: ContentTypeConfig = {
    apiIdentifier: 'users',
    fields: {
        name: defineTextField('name', { required: true }),
        isAdmin: defineBooleanField('isAdmin', { defaultValue: false }),
        // posts: O2M wird von der 'posts'-Seite definiert
    }
};

export const postsConfig: ContentTypeConfig = {
    apiIdentifier: 'posts',
    fields: {
        title: defineTextField('title', { required: true }),
        slug: defineSlugField('slug', { sourceField: 'title' }),
        content: defineTextField('content', { uiWidget: 'textarea' }),
        publishedAt: defineDateTimeField('publishedAt', { required: false }),
        author: defineRelationField('author', { // M2O / FK
            relationTo: 'users',
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

export const allContentTypeConfigs: Record<string, ContentTypeConfig> = {
    [usersConfig.apiIdentifier]: usersConfig,
    [postsConfig.apiIdentifier]: postsConfig,
    [categoriesConfig.apiIdentifier]: categoriesConfig,
};
