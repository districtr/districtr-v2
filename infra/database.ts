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

  // Public subnets (the stack runs no NAT); the instance still gets no public
  // IP (publiclyAccessible: false) and the SG only admits backend tasks.
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
    publiclyAccessible: false,
    multiAz: config.dbMultiAz,
    backupRetentionPeriod: config.isProd ? 7 : 1,
    copyTagsToSnapshot: true,
    deletionProtection: config.isProd,
    skipFinalSnapshot: !config.isProd,
    finalSnapshotIdentifier: `${name}-db-final`,
    performanceInsightsEnabled: config.isProd,
    // Prod defers parameter/instance-class changes to the maintenance window so
    // they can't cause surprise business-hours unavailability; dev applies
    // immediately for fast iteration. (Doesn't affect initial creation.)
    applyImmediately: !config.isProd,
  });

  // Matches Settings.DATABASE_URL in backend/app/core/config.py.
  const databaseUrl = pulumi.interpolate`postgresql+psycopg://${DB_USER}:${password.result}@${db.address}:5432/${DB_NAME}`;

  return {db, databaseUrl};
}

export type Database = ReturnType<typeof createDatabase>;
