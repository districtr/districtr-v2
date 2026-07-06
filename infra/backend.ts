import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {Network} from "./network";
import {ClusterResources} from "./cluster";
import {Alb} from "./alb";
import {BackendTaskConfig, ECS_TASKS_TRUST} from "./backendtask";

export function createBackend(
  network: Network,
  clusterResources: ClusterResources,
  alb: Alb,
  taskConfig: BackendTaskConfig
) {
  const name = config.name;
  const {cluster, logGroups} = clusterResources;
  const {executionRole, image, environment, secrets, logConfiguration} = taskConfig;

  // Task role: graphs (read) and thumbnails (write) in S3.
  const taskRole = new aws.iam.Role(`${name}-backend-task-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicy(`${name}-backend-task-s3`, {
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

  // ECS Exec (SSM Session Manager): `aws ecs execute-command` into a running
  // backend task to reach RDS from inside the VPC — the image already has
  // psql/pg_dump and the SG already allows 5432, so data loads and backfills
  // need no public DB exposure. Channels are SSM-scoped, hence Resource: "*".
  new aws.iam.RolePolicy(`${name}-backend-task-ssm-exec`, {
    role: taskRole.id,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "ssmmessages:CreateControlChannel",
            "ssmmessages:CreateDataChannel",
            "ssmmessages:OpenControlChannel",
            "ssmmessages:OpenDataChannel",
          ],
          Resource: "*",
        },
      ],
    }),
  });

  // --- Task definitions ---
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
  new aws.ecs.TaskDefinition(`${name}-migrate-task`, {
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
      // Operators shell into a task via SSM to reach RDS (see task-role policy).
      enableExecuteCommand: true,
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
      // Single uvicorn worker on a multi-vCPU task plateaus near
      // 100/vCPU-count percent average utilization; 45% still triggers
      // scale-out before the worker saturates.
      targetValue: 45,
      scaleOutCooldown: 60,
      scaleInCooldown: 300,
    },
  });

  return {service};
}

export type Backend = ReturnType<typeof createBackend>;
