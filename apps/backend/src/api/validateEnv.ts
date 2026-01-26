/**
 * Environment Variable Validation
 * Validates all required env vars on startup per security best practices
 */

interface EnvValidationError {
  variable: string;
  issue: string;
}

/**
 * Validate all required environment variables
 * Throws error with clear instructions if any are missing or invalid
 */
export function validateEnvironment(): void {
  const errors: EnvValidationError[] = [];

  // Required for all modes
  validateRequired('NODE_ENV', errors);
  validateRequired('PORT', errors);
  validateRequired('DATABASE_URL', errors);
  validateRequired('REDIS_URL', errors);
  validateRequired('JWT_SECRET', errors);
  validateRequired('JWT_EXPIRES_IN', errors);

  // Validate JWT_SECRET is not the insecure default
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret === 'your-secret-key-change-in-production') {
    errors.push({
      variable: 'JWT_SECRET',
      issue: 'Must not use default value. Generate secure secret with: openssl rand -hex 32',
    });
  }

  if (jwtSecret && jwtSecret.length < 32) {
    errors.push({
      variable: 'JWT_SECRET',
      issue: 'Must be at least 32 characters long for security',
    });
  }

  // Binance API keys only required for LIVE mode
  // Not validating here as they're optional for PAPER mode

  if (errors.length > 0) {
    const errorMessages = errors.map((err) => `  - ${err.variable}: ${err.issue}`).join('\n');

    throw new Error(
      `Environment validation failed. Fix the following issues:\n\n${errorMessages}\n\n` +
        `See .env.example for required variables.`
    );
  }
}

function validateRequired(name: string, errors: EnvValidationError[]): void {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    errors.push({
      variable: name,
      issue: 'Required but not set',
    });
  }
}
