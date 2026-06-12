import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {Network} from "./network";
import {ClusterResources} from "./cluster";
import {Alb} from "./alb";
import {Repos} from "./ecr";
import {Database} from "./database";

const ECS_TASKS_TRUST = aws.iam.assumeRolePolicyForPrincipal({
  Service: "ecs-tasks.amazonaws.com",
});

export function createBackend(
  network: Network,
  clusterResources: ClusterResources,
  alb: Alb,
  repos: Repos,
  database: Database
) {
  const name = config.name;
  const {cluster, logGroups} = clusterResources;
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

  // Task role replaces the static AWS keys the Fly deployment used: graphs
  // (read) and thumbnails (write) live in the existing bucket.
  const taskRole = new aws.iam.Role(`${name}-backend-task-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicy(`${name}-backend-task-s3`, {
    role: taskRole.id,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:HeadObject", "s3:ListBucket"],
          Resource: [
            `arn:aws:s3:::${config.s3BucketName}`,
            `arn:aws:s3:::${config.s3BucketName}/*`,
          ],
        },
      ],
    }),
  });

  // --- Task definitions ---
  const environment = [
    {name: "ENVIRONMENT", value: config.environment},
    {name: "DOMAIN", value: config.apiDomain},
    {name: "PROJECT_NAME", value: "Districtr v2 backend"},
    {name: "BACKEND_CORS_ORIGINS", value: config.corsOrigins},
    {name: "R2_BUCKET_NAME", value: config.s3BucketName},
    {name: "CDN_URL", value: config.cdnUrl},
    {name: "VOLUME_PATH", value: "/data"},
    {name: "AUTH0_DOMAIN", value: config.auth0Domain},
    {name: "AUTH0_API_AUDIENCE", value: config.auth0ApiAudience},
    {name: "AUTH0_ISSUER", value: config.auth0Issuer},
    {name: "AUTH0_ALGORITHMS", value: config.auth0Algorithms},
    // Auth via the task role (default boto3 chain), not static keys.
    {name: "AWS_USE_DEFAULT_CREDENTIALS", value: "true"},
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

  const taskDefinition = new aws.ecs.TaskDefinition(`${name}-backend-task`, {
    family: `${name}-backend`,
    cpu: `${config.backendCpu}`,
    memory: `${config.backendMemory}`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "backend",
        image,
        essential: true,
        portMappings: [{containerPort: 8080, protocol: "tcp"}],
        environment,
        secrets,
        logConfiguration: logConfiguration(logGroups.backend),
      },
    ]),
  });

  // One-off `alembic upgrade head` task, RunTask-only (no service). The
  // deploy workflow registers a revision with the new image and runs it
  // before rolling the service — the Fly release_command equivalent.
  const migrateTaskDefinition = new aws.ecs.TaskDefinition(`${name}-migrate-task`, {
    family: `${name}-migrate`,
    cpu: "1024",
    memory: "4096",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "migrate",
        image,
        essential: true,
        command: ["alembic", "upgrade", "head"],
        environment,
        secrets,
        logConfiguration: logConfiguration(logGroups.migrate),
      },
    ]),
  });

  // --- Service + autoscaling ---
  const service = new aws.ecs.Service(
    `${name}-backend-service`,
    {
      name: "backend",
      cluster: cluster.arn,
      launchType: "FARGATE",
      taskDefinition: taskDefinition.arn,
      desiredCount: config.backendMinCount,
      networkConfiguration: {
        subnets: network.publicSubnetIds,
        securityGroups: [network.backendSecurityGroup.id],
        assignPublicIp: true,
      },
      loadBalancers: [
        {
          targetGroupArn: alb.backendTargetGroup.arn,
          containerName: "backend",
          containerPort: 8080,
        },
      ],
      deploymentMinimumHealthyPercent: 100,
      deploymentMaximumPercent: 200,
      deploymentCircuitBreaker: {enable: true, rollback: true},
      healthCheckGracePeriodSeconds: 60,
    },
    {
      dependsOn: [alb.httpsListener],
      // Autoscaling owns the live count.
      ignoreChanges: ["desiredCount"],
    }
  );

  const scalingTarget = new aws.appautoscaling.Target(`${name}-backend-scaling-target`, {
    serviceNamespace: "ecs",
    scalableDimension: "ecs:service:DesiredCount",
    resourceId: pulumi.interpolate`service/${cluster.name}/${service.name}`,
    minCapacity: config.backendMinCount,
    maxCapacity: config.backendMaxCount,
  });

  new aws.appautoscaling.Policy(`${name}-backend-scaling-policy`, {
    policyType: "TargetTrackingScaling",
    serviceNamespace: scalingTarget.serviceNamespace,
    scalableDimension: scalingTarget.scalableDimension,
    resourceId: scalingTarget.resourceId,
    targetTrackingScalingPolicyConfiguration: {
      predefinedMetricSpecification: {
        predefinedMetricType: "ECSServiceAverageCPUUtilization",
      },
      targetValue: 60,
      scaleOutCooldown: 60,
      scaleInCooldown: 300,
    },
  });

  return {service, taskDefinition, migrateTaskDefinition};
}

export type Backend = ReturnType<typeof createBackend>;
