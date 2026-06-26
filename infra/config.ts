import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();
const stack = pulumi.getStack();

if (stack !== "dev" && stack !== "prod") {
  throw new Error(`Unsupported stack "${stack}" — expected "dev" or "prod"`);
}

const isProd = stack === "prod";

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
  apiDomain: cfg.require("apiDomain"),
  extraDomains: cfg.getObject<string[]>("extraDomains") ?? [],
  corsOrigins: cfg.require("corsOrigins"),

  // Existing object storage / CDN — not managed by this project.
  s3BucketName: cfg.require("s3BucketName"),
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
  recaptchaSecretKey: cfg.getSecret("recaptchaSecretKey"),

  // Image tags. Deploy workflows write the current git SHA to
  // /districtr/{stack}/meta/{backend,frontend}-image-tag in SSM before
  // `pulumi up`; config values override for manual rollbacks.
  backendImageTagOverride: cfg.get("backendImageTag"),
  frontendImageTagOverride: cfg.get("frontendImageTag"),

  // Task sizing (Fargate cpu units / MiB)
  backendCpu: cfg.getNumber("backendCpu") ?? (isProd ? 2048 : 1024),
  backendMemory: cfg.getNumber("backendMemory") ?? 8192,
  backendMinCount: cfg.getNumber("backendMinCount") ?? (isProd ? 2 : 1),
  backendMaxCount: cfg.getNumber("backendMaxCount") ?? (isProd ? 6 : 2),
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

  // Monitoring
  alarmEmail: cfg.get("alarmEmail"),
  logRetentionDays: cfg.getNumber("logRetentionDays") ?? (isProd ? 90 : 30),
};
