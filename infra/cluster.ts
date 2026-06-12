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

  const logGroup = (component: string) =>
    new aws.cloudwatch.LogGroup(`${name}-${component}-logs`, {
      name: `/districtr/${config.stack}/${component}`,
      retentionInDays: config.logRetentionDays,
    });

  const logGroups = {
    backend: logGroup("backend"),
    frontend: logGroup("frontend"),
    migrate: logGroup("migrate"),
  };

  return {cluster, logGroups};
}

export type ClusterResources = ReturnType<typeof createCluster>;
