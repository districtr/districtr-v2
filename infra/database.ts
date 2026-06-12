import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import {config} from "./config";
import {Network} from "./network";

const DB_NAME = "districtr";
const DB_USER = "districtr";

export function createDatabase(network: Network) {
  const name = config.name;

  const password = new random.RandomPassword(`${name}-db-password`, {
    length: 32,
    special: false,
  });

  // Subnets are public so dbPubliclyAccessible can be flipped for one-off
  // data loads; with the flag off the instance has no public IP and the
  // security group only admits backend tasks.
  const subnetGroup = new aws.rds.SubnetGroup(`${name}-db-subnets`, {
    name: `${name}-db-subnets`,
    subnetIds: network.publicSubnetIds,
  });

  const db = new aws.rds.Instance(`${name}-db`, {
    identifier: `${name}-db`,
    engine: "postgres",
    engineVersion: config.dbEngineVersion,
    autoMinorVersionUpgrade: true,
    instanceClass: config.dbInstanceClass,
    allocatedStorage: config.dbAllocatedStorage,
    maxAllocatedStorage: config.dbAllocatedStorage * 4,
    storageType: "gp3",
    storageEncrypted: true,
    dbName: DB_NAME,
    username: DB_USER,
    password: password.result,
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [network.dbSecurityGroup.id],
    publiclyAccessible: config.dbPubliclyAccessible,
    multiAz: config.dbMultiAz,
    backupRetentionPeriod: config.isProd ? 7 : 1,
    copyTagsToSnapshot: true,
    deletionProtection: config.isProd,
    skipFinalSnapshot: !config.isProd,
    finalSnapshotIdentifier: `${name}-db-final`,
    performanceInsightsEnabled: config.isProd,
    applyImmediately: true,
  });

  // Matches Settings.DATABASE_URL in backend/app/core/config.py.
  const databaseUrl = pulumi.interpolate`postgresql+psycopg://${DB_USER}:${password.result}@${db.address}:5432/${DB_NAME}`;

  return {db, databaseUrl};
}

export type Database = ReturnType<typeof createDatabase>;
