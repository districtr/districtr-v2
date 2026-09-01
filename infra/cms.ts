import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {Network} from "./network";
import {ClusterResources} from "./cluster";
import {Alb} from "./alb";
import {Repos} from "./ecr";
import {Database} from "./database";
import {ECS_TASKS_TRUST} from "./backendtask";

/**
 * Districtr CMS (Django/Wagtail): content admin, JWT issuer (JWKS consumed by
 * the backend), public content/gallery APIs. Deliberately small — ~20 admin
 * users and ISR-shielded public reads — one task, no autoscaling.
 */
export function createCms(
  network: Network,
  clusterResources: ClusterResources,
  alb: Alb,
  repos: Repos,
  database: Database
) {
  const name = config.name;
  const {cluster, logGroups} = clusterResources;
  const region = aws.getRegionOutput().name;

  const imageTag = config.cmsImageTagOverride
    ? pulumi.output(config.cmsImageTagOverride)
    : aws.ssm.getParameterOutput({name: `/districtr/${config.stack}/meta/cms-image-tag`}).value;
  const image = pulumi.interpolate`${repos.cmsRepo.repositoryUrl}:${imageTag}`;

  // --- Secrets: Pulumi config -> SSM SecureString -> task definition ---
  const ssmPrefix = `/districtr/${config.stack}/cms`;
  const secretParams: {envName: string; param: aws.ssm.Parameter}[] = [];

  function addSecret(envName: string, value: pulumi.Input<string> | undefined) {
    if (value === undefined) return;
    secretParams.push({
      envName,
      param: new aws.ssm.Parameter(`${name}-cms-${envName}`, {
        name: `${ssmPrefix}/${envName}`,
        type: "SecureString",
        value,
      }),
    });
  }

  addSecret("POSTGRES_PASSWORD", database.dbPassword);
  addSecret("DJANGO_SECRET_KEY", config.djangoSecretKey);
  addSecret("JWT_SIGNING_KEY", config.jwtSigningKey);
  addSecret("JWT_VERIFYING_KEY", config.jwtVerifyingKey);
  addSecret("JWT_NEXT_VERIFYING_KEY", config.jwtNextVerifyingKey);
  addSecret("RESEND_API_KEY", config.resendApiKey);

  // --- IAM ---
  const executionRole = new aws.iam.Role(`${name}-cms-exec-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicyAttachment(`${name}-cms-exec-managed`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });
  new aws.iam.RolePolicy(`${name}-cms-exec-ssm`, {
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

  // Task role: GeoPackage/overlay uploads and media storage in S3.
  const taskRole = new aws.iam.Role(`${name}-cms-task-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicy(`${name}-cms-task-s3`, {
    role: taskRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
          Resource: [
            pulumi.interpolate`arn:aws:s3:::${config.s3BucketName}`,
            pulumi.interpolate`arn:aws:s3:::${config.s3BucketName}/*`,
          ],
        },
      ],
    }),
  });

  const environment = [
    {name: "DJANGO_SETTINGS_MODULE", value: "config.settings.production"},
    {name: "DJANGO_ALLOWED_HOSTS", value: config.cmsDomain},
    {name: "DJANGO_CSRF_TRUSTED_ORIGINS", value: `https://${config.cmsDomain}`},
    {name: "WAGTAILADMIN_BASE_URL", value: `https://${config.cmsDomain}`},
    {name: "JWT_ISSUER", value: `https://${config.cmsDomain}`},
    {name: "JWT_AUDIENCE", value: config.jwtAudience},
    {name: "BACKEND_API_URL", value: `https://${config.apiDomain}`},
    // Wagtail's "View live" / FrontendPageMixin URLs point at the public
    // site; without this the base.py localhost default leaks into prod.
    {name: "FRONTEND_URL", value: `https://${config.appDomain}`},
    {name: "R2_BUCKET_NAME", value: config.s3BucketName},
    {name: "OVERLAY_PUBLIC_URL_BASE", value: config.cdnUrl},
    // Auth via the task role (default boto3 chain), not static keys.
    {name: "AWS_USE_DEFAULT_CREDENTIALS", value: "true"},
    {name: "AWS_DEFAULT_REGION", value: region},
  ];
  const secrets = secretParams.map(s => ({name: s.envName, valueFrom: s.param.arn}));
  // Discrete POSTGRES_* vars (Django settings contract); password is a secret.
  const dbEnvironment = [
    {name: "POSTGRES_DB", value: database.dbName},
    {name: "POSTGRES_USER", value: database.dbUser},
    {name: "POSTGRES_SERVER", value: database.db.address},
    {name: "POSTGRES_PORT", value: "5432"},
  ];

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

  const taskDefinition = new aws.ecs.TaskDefinition(`${name}-cms-task`, {
    family: `${name}-cms`,
    cpu: `${config.cmsCpu}`,
    memory: `${config.cmsMemory}`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "cms",
        image,
        essential: true,
        portMappings: [{containerPort: 8080, protocol: "tcp"}],
        environment: [...environment, ...dbEnvironment],
        secrets,
        logConfiguration: logConfiguration(logGroups.cms),
      },
    ]),
  });

  // One-off release task (Fly release_command equivalent): ensure the `admin`
  // schema exists, then run Django migrations. RunTask-only, no service.
  new aws.ecs.TaskDefinition(`${name}-cms-migrate-task`, {
    family: `${name}-cms-migrate`,
    cpu: "512",
    memory: "1024",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "cms-migrate",
        image,
        essential: true,
        command: [
          "sh",
          "-c",
          "python manage.py bootstrap_schema && python manage.py migrate --noinput",
        ],
        environment: [...environment, ...dbEnvironment],
        secrets,
        logConfiguration: logConfiguration(logGroups.cmsMigrate),
      },
    ]),
  });

  const service = new aws.ecs.Service(
    `${name}-cms-service`,
    {
      name: "cms",
      cluster: cluster.arn,
      launchType: "FARGATE",
      taskDefinition: taskDefinition.arn,
      desiredCount: 1,
      networkConfiguration: {
        subnets: network.publicSubnetIds,
        securityGroups: [network.cmsSecurityGroup.id],
        assignPublicIp: true,
      },
      loadBalancers: [
        {
          targetGroupArn: alb.cmsTargetGroup.arn,
          containerName: "cms",
          containerPort: 8080,
        },
      ],
      deploymentMinimumHealthyPercent: 100,
      deploymentMaximumPercent: 200,
      deploymentCircuitBreaker: {enable: true, rollback: true},
      healthCheckGracePeriodSeconds: 60,
    },
    {dependsOn: [alb.httpsListener]}
  );

  return {service};
}

export type Cms = ReturnType<typeof createCms>;
