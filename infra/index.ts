import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";
import {createNetwork} from "./network";
import {createRepos} from "./ecr";
import {createDatabase} from "./database";
import {createCluster} from "./cluster";
import {createAlb} from "./alb";
import {createBackendTaskConfig, createBackend} from "./backend";
import {createFrontend} from "./frontend";
import {createMonitoring} from "./monitoring";
import {createGraphCheck} from "./graphcheck";

const network = createNetwork();
const repos = createRepos();
const database = createDatabase(network);
const clusterResources = createCluster();
const alb = createAlb(network);
const backendTaskConfig = createBackendTaskConfig(repos, database);
const backend = createBackend(network, clusterResources, alb, backendTaskConfig);
const frontend = createFrontend(network, clusterResources, alb, repos);
const {topic} = createMonitoring(alb, database, clusterResources, backend, frontend);
createGraphCheck(clusterResources, network, backendTaskConfig, topic.arn);

// --- Outputs consumed by the deploy workflows (migrate RunTask) ---
export const clusterName = clusterResources.cluster.name;
export const publicSubnetIds = pulumi.all(network.publicSubnetIds);
export const backendSecurityGroupId = network.backendSecurityGroup.id;

// --- Outputs for humans ---
export const albDnsName = alb.alb.dnsName;
export const dbAddress = database.db.address;
export const backendRepoUrl = repos.backendRepo.repositoryUrl;
export const frontendRepoUrl = repos.frontendRepo.repositoryUrl;

// Every DNS record to create at the external DNS provider. The ACM
// validation records must exist before the first `pulumi up` can finish
// (the CertificateValidation resource waits for issuance).
export const dnsRecords = pulumi
  .all([alb.alb.dnsName, alb.certificate.domainValidationOptions])
  .apply(([albDns, validationOptions]) => {
    const records: {name: string; type: string; value: string; purpose: string}[] = [
      ...[config.appDomain, config.apiDomain, ...config.extraDomains].map(domain => ({
        name: domain,
        type: "CNAME",
        value: albDns,
        purpose: "routing (use ALIAS/flattening for apex domains)",
      })),
      ...validationOptions.map(option => ({
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        value: option.resourceRecordValue,
        purpose: "ACM certificate validation",
      })),
    ];
    return records;
  });
