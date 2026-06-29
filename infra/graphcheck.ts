import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {ClusterResources} from "./cluster";
import {Network} from "./network";
import {Backend} from "./backend";

const ECS_TASKS_TRUST = aws.iam.assumeRolePolicyForPrincipal({
  Service: "ecs-tasks.amazonaws.com",
});

export function createGraphCheck(
  clusterResources: ClusterResources,
  network: Network,
  backend: Backend,
  alarmTopicArn: pulumi.Input<string>
) {
  const name = config.name;
  const {cluster} = clusterResources;
  const {executionRole, image, environment, secrets} = backend;
  const region = aws.getRegionOutput().name;

  const logGroup = new aws.cloudwatch.LogGroup(`${name}-graph-check-logs`, {
    name: `/districtr/${config.stack}/graph-check`,
    retentionInDays: config.logRetentionDays,
  });

  // Dedicated task role: S3 read (graphs) + SNS publish (alerts).
  const taskRole = new aws.iam.Role(`${name}-graph-check-task-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });

  new aws.iam.RolePolicy(`${name}-graph-check-task-s3`, {
    role: taskRole.id,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:HeadObject", "s3:ListBucket"],
          Resource: [
            `arn:aws:s3:::${config.s3BucketName}`,
            `arn:aws:s3:::${config.s3BucketName}/*`,
          ],
        },
      ],
    }),
  });

  new aws.iam.RolePolicy(`${name}-graph-check-task-sns`, {
    role: taskRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["sns:Publish"],
          Resource: alarmTopicArn,
        },
      ],
    }),
  });

  const taskDefinition = new aws.ecs.TaskDefinition(`${name}-graph-check-task`, {
    family: `${name}-graph-check`,
    cpu: "512",
    memory: "1024",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "graph-check",
        image,
        essential: true,
        command: ["python", "cli.py", "check-missing-graphs"],
        environment: [
          ...environment,
          {name: "ALARM_SNS_TOPIC_ARN", value: alarmTopicArn},
        ],
        secrets,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroup.name,
            "awslogs-region": region,
            "awslogs-stream-prefix": "ecs",
          },
        },
      },
    ]),
  });

  // EventBridge Scheduler role: allowed to launch this specific task only.
  const schedulerRole = new aws.iam.Role(`${name}-graph-check-scheduler-role`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "scheduler.amazonaws.com",
    }),
  });

  new aws.iam.RolePolicy(`${name}-graph-check-scheduler-policy`, {
    role: schedulerRole.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["ecs:RunTask"],
          Resource: taskDefinition.arn,
        },
        {
          Effect: "Allow",
          Action: ["iam:PassRole"],
          Resource: [executionRole.arn, taskRole.arn],
        },
      ],
    }),
  });

  new aws.scheduler.Schedule(`${name}-graph-check-schedule`, {
    name: `${name}-graph-check`,
    scheduleExpression: "cron(0 6 * * ? *)",
    scheduleExpressionTimezone: "UTC",
    flexibleTimeWindow: {mode: "OFF"},
    target: {
      arn: cluster.arn,
      roleArn: schedulerRole.arn,
      ecsParameters: {
        taskDefinitionArn: taskDefinition.arn,
        launchType: "FARGATE",
        networkConfiguration: {
          subnets: network.publicSubnetIds,
          securityGroups: [network.backendSecurityGroup.id],
          assignPublicIp: true,
        },
      },
    },
  });
}
