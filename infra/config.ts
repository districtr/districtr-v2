import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();
const stack = pulumi.getStack();

if (stack !== "dev" && stack !== "prod") {
  throw new Error(`Unsupported stack "${stack}" — expected "dev" or "prod"`);
}

const isProd = stack === "prod";

// Turnstile migration guard: the old reCAPTCHA secrets are useless for
// Turnstile verification, so a stack that still carries them without the
// replacements would silently deploy captcha-less comment endpoints and
// unverified session minting. Fail the deploy instead.
for (const [oldKey, newKey] of [
  ["recaptchaSecretKey", "turnstileSecretKey"],
  ["recaptchaV3SecretKey", "turnstileSessionSecretKey"],
] as const) {
  if (cfg.getSecret(oldKey) && !cfg.getSecret(newKey)) {
    throw new Error(
      `Stack config still has ${oldKey} but ${newKey} is unset — run ` +
        `"pulumi config set --secret ${newKey} <value>" then "pulumi config rm ${oldKey}"`
    );
  }
}

// Hoisted: the listener rule and the WAF rate limit must scope to the *same*
// set of API hostnames, so it's computed once rather than derived twice.
const apiDomain = cfg.require("apiDomain");
const extraApiDomains = cfg.getObject<string[]>("extraApiDomains") ?? [];

export const config = {
  stack,
  isProd,
  /** Resource name prefix, e.g. districtr-dev. */
  name: `districtr-${stack}`,
  /** Value of the backend ENVIRONMENT var; gates Sentry init and friends. */
  environment: cfg.get("environment") ?? (isProd ? "production" : "qa"),

  // Domains. The ALB serves the app on appDomain (+ extraDomains) and the
  // API on apiDomain via a host-header listener rule.
  appDomain: cfg.require("appDomain"),
  apiDomain,
  extraDomains: cfg.getObject<string[]>("extraDomains") ?? [],
  // Additional hostnames that must reach the backend, in either direction of a
  // domain cutover: the incoming name before apiDomain flips, the outgoing one
  // after (NEXT_PUBLIC_API_URL is baked in at build time, so loaded clients go
  // on calling it). Names here still need a cert — list them in extraDomains
  // too. Empty outside a cutover.
  extraApiDomains,
  /** Every hostname routed to the backend. Anything answering on one of these
   * bypasses the frontend target group *and* falls under the API rate limit;
   * the two must not disagree. */
  apiHosts: Array.from(new Set([apiDomain, ...extraApiDomains])),
  corsOrigins: cfg.require("corsOrigins"),

  // Existing object storage / CDN — not managed by this project.
  s3BucketName: cfg.requireSecret("s3BucketName"),
  cdnUrl: cfg.require("cdnUrl"),

  // Auth0 (non-secret identifiers)
  auth0Domain: cfg.require("auth0Domain"),
  auth0ApiAudience: cfg.require("auth0ApiAudience"),
  auth0Issuer: cfg.require("auth0Issuer"),
  auth0Algorithms: cfg.get("auth0Algorithms") ?? "RS256",

  // Secrets (KMS-encrypted in the stack file; land in SSM SecureStrings)
  secretKey: cfg.requireSecret("secretKey"),
  auth0ClientId: cfg.requireSecret("auth0ClientId"),
  auth0ClientSecret: cfg.requireSecret("auth0ClientSecret"),
  auth0SessionSecret: cfg.requireSecret("auth0SessionSecret"),
  openaiApiKey: cfg.getSecret("openaiApiKey"),
  turnstileSecretKey: cfg.getSecret("turnstileSecretKey"),
  turnstileSessionSecretKey: cfg.getSecret("turnstileSessionSecretKey"),
  researchApiKey: cfg.getSecret("researchApiKey"),

  // Image tags. Deploy workflows write the current git SHA to
  // /districtr/{stack}/meta/{backend,frontend}-image-tag in SSM before
  // `pulumi up`; config values override for manual rollbacks.
  backendImageTagOverride: cfg.get("backendImageTag"),
  frontendImageTagOverride: cfg.get("frontendImageTag"),

  // Forces the frontend into maintenance mode during planned downtime
  // (e.g. DB migration), independent of the CMS flag in the database.
  // CI passes the UNDER_CONSTRUCTION repo variable through the environment;
  // Pulumi config overrides for manual runs.
  underConstruction:
    cfg.getBoolean("underConstruction") ?? process.env.UNDER_CONSTRUCTION === "true",

  // Task sizing (Fargate cpu units / MiB)
  backendCpu: cfg.getNumber("backendCpu") ?? (isProd ? 2048 : 1024),
  backendMemory: cfg.getNumber("backendMemory") ?? 8192,
  backendMinCount: cfg.getNumber("backendMinCount") ?? (isProd ? 2 : 1),
  backendMaxCount: cfg.getNumber("backendMaxCount") ?? (isProd ? 6 : 2),
  // ALB requests/min per backend task before scale-out.
  backendRequestsPerTarget: cfg.getNumber("backendRequestsPerTarget") ?? 600,
  frontendCpu: cfg.getNumber("frontendCpu") ?? (isProd ? 1024 : 512),
  frontendMemory: cfg.getNumber("frontendMemory") ?? 2048,
  frontendMinCount: cfg.getNumber("frontendMinCount") ?? (isProd ? 2 : 1),
  frontendMaxCount: cfg.getNumber("frontendMaxCount") ?? (isProd ? 4 : 2),

  // Database
  dbInstanceClass: cfg.get("dbInstanceClass") ?? (isProd ? "db.t4g.large" : "db.t4g.small"),
  dbAllocatedStorage: cfg.getNumber("dbAllocatedStorage") ?? (isProd ? 100 : 20),
  dbMultiAz: cfg.getBoolean("dbMultiAz") ?? isProd,
  dbEngineVersion: cfg.get("dbEngineVersion") ?? "16",

  // Networking
  vpcCidr: cfg.get("vpcCidr") ?? (isProd ? "10.0.0.0/16" : "10.1.0.0/16"),
  // WAF allow-before-everything IPs (CIDRs, e.g. "1.2.3.4/32"); empty = no rule.
  wafAllowlistIps: cfg.getObject<string[]>("wafAllowlistIps") ?? [],

  // Monitoring
  alarmEmails: cfg.getObject<string[]>("alarmEmails") ?? [],
  logRetentionDays: cfg.getNumber("logRetentionDays") ?? (isProd ? 90 : 30),
};
