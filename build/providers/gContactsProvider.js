import { google } from 'googleapis';
import * as dotenv from 'dotenv';
// Load environment variables
dotenv.config();
export class GoogleContactsProvider {
    auth = null;
    people = null;
    /**
     * Initialize the Google Calendar client
     */
    async initialize() {
        try {
            // Set up OAuth2 client
            this.auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
        }
        catch (error) {
            console.error('Error initializing Google Mail client:', error);
            throw error;
        }
    }
    /**
     * Get authorization URL for OAuth2 flow
     */
    getAuthUrl() {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        return this.auth.generateAuthUrl({
            access_type: 'offline',
            scope: [
                "profile", // Basic profile info
                "email", // User email address
                "https://www.googleapis.com/auth/gmail.modify", // Modify Gmail data
                "https://www.googleapis.com/auth/gmail.readonly", // Read Gmail data
                "https://www.googleapis.com/auth/drive", // Access Google Drive
                "https://www.googleapis.com/auth/calendar", // Access Google Calendar
                "https://www.googleapis.com/auth/tasks", // Access Google Tasks
                "https://www.googleapis.com/auth/youtube.readonly", // Read YouTube data
                "https://www.googleapis.com/auth/contacts.readonly", // Read Google Contacts
                "https://www.googleapis.com/auth/contacts", // Manage Google Contacts
            ],
            prompt: 'consent', // Always show consent screen to ensure we get a refresh token
            include_granted_scopes: true
        });
    }
    /**
     * Set authorization code from OAuth2 flow
     */
    async setAuthCode(code) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        const { tokens } = await this.auth.getToken(code);
        this.auth.setCredentials(tokens);
        // Initialize the calendar client
        this.people = google.people({ version: 'v1', auth: this.auth });
        console.error('Successfully authenticated with Google Mail API');
        console.error('Refresh token:', tokens.refresh_token);
        console.error('Add this refresh token to your .env file as GOOGLE_REFRESH_TOKEN');
    }
    /**
     * Get the tool definitions
     */
    getToolDefinitions() {
        return [
            {
                name: 'contacts_listContacts',
                description: 'List contacts from the users Google Contacts.',
                inputSchema: {
                    type: "object",
                    properties: {
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (default: 10)',
                        },
                    },
                },
            },
            {
                name: 'contacts_searchContacts',
                description: 'Search for contacts by name, email, or phone number.',
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The query string to search for (e.g., "John Doe", "steffie")',
                        },
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (default: 10)',
                        },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'contacts_getContact',
                description: 'Get detailed information for a specific contact using their resource name.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        resourceName: {
                            type: 'string',
                            description: 'The resource name of the contact (e.g., "people/c123456789")',
                        },
                    },
                    required: ['resourceName'],
                },
            }
        ];
    }
    /**
     * Send an email using People API
     */
    async listContacts(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the people client
        this.people = google.people({ version: "v1", auth: this.auth });
        const { pageSize } = parameters;
        try {
            const response = await this.people.people.connections.list({
                resourceName: "people/me",
                pageSize,
                personFields: 'names,emailAddresses,phoneNumbers', // Specify the fields you want
                // Add sortOrder if needed: people.connections.list({ sortOrder: 'LAST_MODIFIED_ASCENDING' })
            });
            // const connections = response.data.connections;
            // if (!connections || connections.length === 0) {
            //   return { content: [{ type: "text", text: "No contacts found." }] };
            // }
            // const formattedContacts = connections.map((person) => ({
            //   resourceName: person.resourceName,
            //   name: person.names?.[0]?.displayName || "N/A",
            //   emails:
            //     person.emailAddresses?.map((e) => e.value).filter(Boolean) || [],
            //   phoneNumbers:
            //     person.phoneNumbers?.map((p) => p.value).filter(Boolean) || [],
            // }));
            return response;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    async searchContacts(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the people client
        this.people = google.people({ version: "v1", auth: this.auth });
        const { query, pageSize } = parameters;
        // let files: string[] = [];
        try {
            const response = await this.people.people.searchContacts({
                // Corrected API endpoint
                query,
                pageSize,
                readMask: 'names,emailAddresses,phoneNumbers', // Specify the fields you want
            });
            // const results = response.data.results;
            // if (!results || results.length === 0) {
            //   return {
            //     content: [
            //       {
            //         type: "text",
            //         text: `No contacts found matching query "${query}".`,
            //       },
            //     ],
            //   };
            // }
            // const formattedResults = results.map((result) => ({
            //   resourceName: result.person?.resourceName,
            //   name: result.person?.names?.[0]?.displayName || "N/A",
            //   emails:
            //     result.person?.emailAddresses
            //       ?.map((e) => e.value)
            //       .filter(Boolean) || [],
            //   phoneNumbers:
            //     result.person?.phoneNumbers?.map((p) => p.value).filter(Boolean) ||
            //     [],
            // }));
            return response;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * List events in a calendar
     */
    async getContact(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the people client
        this.people = google.people({ version: "v1", auth: this.auth });
        const { resourceName } = parameters;
        try {
            const response = await this.people.people.get({
                resourceName,
                personFields: 'names,emailAddresses,phoneNumbers,birthdays,addresses,organizations,biographies', // Specify the fields you want
            });
            // const person = response.data;
            // // Format the output re
            // const details = {
            //   resourceName: person.resourceName,
            //   names: person.names,
            //   emailAddresses: person.emailAddresses,
            //   phoneNumbers: person.phoneNumbers,
            //   birthdays: person.birthdays,
            //   addresses: person.addresses,
            //   organizations: person.organizations,
            //   biographies: person.biographies,
            // };
            return response;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * Check if the provider is authenticated with Google Calendar
     */
    isAuthenticated() {
        return this.people !== null;
    }
    /**
     * Display authorization URL to the user
     */
    showAuthUrl() {
        const authUrl = this.getAuthUrl();
        console.error('\n🔑 Authorization Required');
        console.error('-------------------');
        console.error('1. Visit this URL to authorize the application:');
        console.error(authUrl);
        console.error('\n2. After approval, you will be redirected to a URL. Copy the "code" parameter from that URL.');
        console.error('\n3. Use the set_auth_code tool or run this command:');
        console.error(`   npx ts-node src/auth-helper.js "PASTE_AUTH_CODE_HERE"\n`);
    }
}
