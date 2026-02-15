import { registerAs } from '@nestjs/config';

export const supertokensConfig = registerAs('supertokens', () => ({
  connectionUri:
    process.env.SUPERTOKENS_CONNECTION_URI || 'http://localhost:3567',
  apiKey: process.env.SUPERTOKENS_API_KEY || '',
  appName: process.env.SUPERTOKENS_APP_NAME || 'MyApp',
  apiDomain: process.env.SUPERTOKENS_API_DOMAIN || 'http://localhost:3000',
  websiteDomain:
    process.env.SUPERTOKENS_WEBSITE_DOMAIN || 'http://localhost:3001',
}));
