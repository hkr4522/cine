// Environment variables with type-safe defaults
interface EnvConfig {
  GEMINI_API_KEY: string;
  TMDB_API_KEY: string;
  NODE_ENV: 'production' | 'production' | 'test';
}

// For development/demo purposes, using mock values
// In production, these would come from environment variables
const env: EnvConfig = {
  GEMINI_API_KEY: '',
  TMDB_API_KEY: '',
  NODE_ENV: 'production' // or 'development', 'test'
};

export default env;
