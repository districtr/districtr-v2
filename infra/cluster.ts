import * as aws from "@pulumi/aws";
import {config} from "./config";

export function createCluster() {
  const name = config.name;

  const cluster = new aws.ecs.Cluster(`${name}-cluster`, {
    name,
    settings: [
      {
        name: "containerInsights",
        value: config.isProd ? "enabled" : "disabled",
      },
    ],
  });

  const logGroups = Object.fromEntries(
    (["backend", "frontend", "migrate"] as const).map(component => [
      component,
      new aws.cloudwatch.LogGroup(`${name}-${component}-logs`, {
        name: `/districtr/${config.stack}/${component}`,
        retentionInDays: config.logRetentionDays,
      }),
    ])
  ) as Record<"backend" | "frontend" | "migrate", aws.cloudwatch.LogGroup>;

  return {cluster, logGroups};
}

export type ClusterResources = ReturnType<typeof createCluster>;
