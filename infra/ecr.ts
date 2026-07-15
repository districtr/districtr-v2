import * as aws from "@pulumi/aws";
import {config} from "./config";

const KEEP_LAST_20 = JSON.stringify({
  rules: [
    {
      rulePriority: 1,
      description: "Keep the last 20 images",
      selection: {
        tagStatus: "any",
        countType: "imageCountMoreThan",
        countNumber: 20,
      },
      action: {type: "expire"},
    },
  ],
});

function createRepo(suffix: "backend" | "frontend") {
  const repo = new aws.ecr.Repository(`${config.name}-${suffix}`, {
    name: `${config.name}-${suffix}`,
    imageTagMutability: "IMMUTABLE",
    forceDelete: !config.isProd,
    imageScanningConfiguration: {scanOnPush: true},
  });

  new aws.ecr.LifecyclePolicy(`${config.name}-${suffix}-lifecycle`, {
    repository: repo.name,
    policy: KEEP_LAST_20,
  });

  return repo;
}

export function createRepos() {
  return {
    backendRepo: createRepo("backend"),
    frontendRepo: createRepo("frontend"),
  };
}

export type Repos = ReturnType<typeof createRepos>;
