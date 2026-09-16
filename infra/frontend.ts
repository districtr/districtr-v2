import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {Network} from "./network";
import {ClusterResources} from "./cluster";
import {Alb} from "./alb";
import {Repos} from "./ecr";

const ECS_TASKS_TRUST = aws.iam.assumeRolePolicyForPrincipal({
  Service: "ecs-tasks.amazonaws.com",
});

export function createFrontend(
  network: Network,
  clusterResources: ClusterResources,
  alb: Alb,
  repos: Repos
) {
  const name = config.name;
  const {cluster, logGroups} = clusterResources;
  const region = aws.getRegionOutput().name;

  const imageTag = config.frontendImageTagOverride
    ? pulumi.output(config.frontendImageTagOverride)
    : aws.ssm.getParameterOutput({name: `/districtr/${config.stack}/meta/frontend-image-tag`}).value;
  const image = pulumi.interpolate`${repos.frontendRepo.repositoryUrl}:${imageTag}`;

  const executionRole = new aws.iam.Role(`${name}-frontend-exec-role`, {
    assumeRolePolicy: ECS_TASKS_TRUST,
  });
  new aws.iam.RolePolicyAttachment(`${name}-frontend-exec-managed`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  const taskDefinition = new aws.ecs.TaskDefinition(`${name}-frontend-task`, {
    family: `${name}-frontend`,
    cpu: `${config.frontendCpu}`,
    memory: `${config.frontendMemory}`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX"},
    executionRoleArn: executionRole.arn,
    containerDefinitions: pulumi.jsonStringify([
      {
        name: "frontend",
        image,
        essential: true,
        portMappings: [{containerPort: 3000, protocol: "tcp"}],
        environment: [
          {name: "APP_BASE_URL", value: `https://${config.appDomain}`},
          {name: "NEXT_SERVER_API_URL", value: `https://${config.apiDomain}`},
          // Server-side CMS content reads.
          {name: "CMS_URL", value: `https://${config.cmsDomain}`},
          {name: "UNDER_CONSTRUCTION", value: String(config.underConstruction)},
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroups.frontend.name,
            "awslogs-region": region,
            "awslogs-stream-prefix": "ecs",
          },
        },
      },
    ]),
  });

  const service = new aws.ecs.Service(
    `${name}-frontend-service`,
    {
      name: "frontend",
      cluster: cluster.arn,
      launchType: "FARGATE",
      taskDefinition: taskDefinition.arn,
      desiredCount: config.frontendMinCount,
      networkConfiguration: {
        subnets: network.publicSubnetIds,
        securityGroups: [network.frontendSecurityGroup.id],
        assignPublicIp: true,
      },
      loadBalancers: [
        {
          targetGroupArn: alb.frontendTargetGroup.arn,
          containerName: "frontend",
          containerPort: 3000,
        },
      ],
      deploymentMinimumHealthyPercent: 100,
      deploymentMaximumPercent: 200,
      deploymentCircuitBreaker: {enable: true, rollback: true},
      healthCheckGracePeriodSeconds: 60,
    },
    {
      dependsOn: [alb.httpsListener],
      ignoreChanges: ["desiredCount"],
    }
  );

  const scalingTarget = new aws.appautoscaling.Target(`${name}-frontend-scaling-target`, {
    serviceNamespace: "ecs",
    scalableDimension: "ecs:service:DesiredCount",
    resourceId: pulumi.interpolate`service/${cluster.name}/${service.name}`,
    minCapacity: config.frontendMinCount,
    maxCapacity: config.frontendMaxCount,
  });

  new aws.appautoscaling.Policy(`${name}-frontend-scaling-policy`, {
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

  return {service};
}

export type Frontend = ReturnType<typeof createFrontend>;
