import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {Repos} from "./ecr";
import {Database} from "./database";

export const ECS_TASKS_TRUST = aws.iam.assumeRolePolicyForPrincipal({
  Service: "ecs-tasks.amazonaws.com",
});

export function createBackendTaskConfig(repos: Repos, database: Database) {
  const name = config.name;
  const region = aws.getRegionOutput().name;

  // Deploy workflows write the git SHA here before `pulumi up`; the config
  // value is an escape hatch for manual rollbacks.
  const imageTag = config.backendImageTagOverride
    ? pulumi.output(config.backendImageTagOverride)
    : aws.ssm.getParameterOutput({name: `/districtr/${config.stack}/meta/backend-image-tag`}).value;
  const image = pulumi.interpolate`${repos.backendRepo.repositoryUrl}:${imageTag}`;

  // --- Secrets: Pulumi config -> SSM SecureString -> task definition ---
  const ssmPrefix = `/districtr/${config.stack}/backend`;
  const secretParams: {envName: string; param: aws.ssm.Parameter}[] = [];

  function addSecret(envName: string, value: pulumi.Input<string> | undefined) {
    if (value === undefined) return;
    secretParams.push({
      envName,
      param: new aws.ssm.Parameter(`${name}-backend-${envName}`, {
        name: `${ssmPrefix}/${envName}`,
        type: "SecureString",
        value,
      }),
    });
  }

  addSecret("DATABASE_URL", database.databaseUrl);
  addSecret("SECRET_KEY", config.secretKey);
  addSecret("OPENAI_API_KEY", config.openaiApiKey);
  addSecret("RECAPTCHA_SECRET_KEY", config.recaptchaSecretKey);

  // --- IAM ---
  const executionRole = new aws.iam.Role(`${name}-backend-exec-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicyAttachment(`${name}-backend-exec-managed`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });
  new aws.iam.RolePolicy(`${name}-backend-exec-ssm`, {
    role: executionRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["ssm:GetParameters"],
          Resource: secretParams.map(s => s.param.arn),
        },
      ],
    }),
  });

  const environment = [
    {name: "ENVIRONMENT", value: config.environment},
    {name: "DOMAIN", value: config.apiDomain},
    {name: "PROJECT_NAME", value: "Districtr v2 backend"},
    {name: "BACKEND_CORS_ORIGINS", value: config.corsOrigins},
    {name: "R2_BUCKET_NAME", value: config.s3BucketName},
    {name: "CDN_URL", value: config.cdnUrl},
    {name: "AUTH0_DOMAIN", value: config.auth0Domain},
    {name: "AUTH0_API_AUDIENCE", value: config.auth0ApiAudience},
    {name: "AUTH0_ISSUER", value: config.auth0Issuer},
    {name: "AUTH0_ALGORITHMS", value: config.auth0Algorithms},
    // Auth via the task role (default boto3 chain), not static keys.
    {name: "AWS_USE_DEFAULT_CREDENTIALS", value: "true"},
    // Keep boto3 on the regional S3 endpoint (and the free gateway path).
    {name: "AWS_DEFAULT_REGION", value: region},
  ];
  const secrets = secretParams.map(s => ({name: s.envName, valueFrom: s.param.arn}));

  function logConfiguration(logGroup: aws.cloudwatch.LogGroup) {
    return {
      logDriver: "awslogs",
      options: {
        "awslogs-group": logGroup.name,
        "awslogs-region": region,
        "awslogs-stream-prefix": "ecs",
      },
    };
  }

  return {executionRole, image, environment, secrets, logConfiguration};
}

export type BackendTaskConfig = ReturnType<typeof createBackendTaskConfig>;
