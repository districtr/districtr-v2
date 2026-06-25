import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {config} from "./config";

// All workloads run in public subnets with strict security groups instead of
// private subnets + NAT: the tasks need broad outbound access (S3, Auth0,
// OpenAI, Sentry) either way, inbound is only possible from the ALB security
// group, and skipping NAT saves ~$32+/mo per environment. RDS never gets a
// public IP; operators reach it via ECS Exec into a backend task.

/** Carve /20 public subnets out of the stack's /16. */
function subnetCidr(vpcCidr: string, index: number): string {
  const octets = vpcCidr.split("/")[0].split(".");
  return `${octets[0]}.${octets[1]}.${index * 16}.0/20`;
}

export function createNetwork() {
  const name = config.name;

  const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
    cidrBlock: config.vpcCidr,
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: {Name: `${name}-vpc`},
  });

  const igw = new aws.ec2.InternetGateway(`${name}-igw`, {
    vpcId: vpc.id,
    tags: {Name: `${name}-igw`},
  });

  const azs = aws.getAvailabilityZonesOutput({state: "available"});

  const publicSubnets = [0, 1].map(
    i =>
      new aws.ec2.Subnet(`${name}-public-${i}`, {
        vpcId: vpc.id,
        cidrBlock: subnetCidr(config.vpcCidr, i),
        availabilityZone: azs.names[i],
        mapPublicIpOnLaunch: false,
        tags: {Name: `${name}-public-${i}`},
      })
  );

  const routeTable = new aws.ec2.RouteTable(`${name}-public-rt`, {
    vpcId: vpc.id,
    routes: [{cidrBlock: "0.0.0.0/0", gatewayId: igw.id}],
    tags: {Name: `${name}-public-rt`},
  });

  publicSubnets.forEach(
    (subnet, i) =>
      new aws.ec2.RouteTableAssociation(`${name}-public-rta-${i}`, {
        subnetId: subnet.id,
        routeTableId: routeTable.id,
      })
  );

  // Free gateway endpoint: graph pickles and thumbnails move between the
  // backend and S3 without touching the public internet.
  new aws.ec2.VpcEndpoint(`${name}-s3-endpoint`, {
    vpcId: vpc.id,
    serviceName: pulumi.interpolate`com.amazonaws.${aws.getRegionOutput().name}.s3`,
    vpcEndpointType: "Gateway",
    routeTableIds: [routeTable.id],
    tags: {Name: `${name}-s3-endpoint`},
  });

  const albSecurityGroup = new aws.ec2.SecurityGroup(`${name}-alb-sg`, {
    vpcId: vpc.id,
    description: "ALB: HTTP/HTTPS from the world",
    ingress: [
      {protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]},
      {protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]},
    ],
    egress: [{protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]}],
    tags: {Name: `${name}-alb-sg`},
  });

  const backendSecurityGroup = new aws.ec2.SecurityGroup(`${name}-backend-sg`, {
    vpcId: vpc.id,
    description: "Backend tasks: 8080 from the ALB only",
    ingress: [{protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [albSecurityGroup.id]}],
    egress: [{protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]}],
    tags: {Name: `${name}-backend-sg`},
  });

  const frontendSecurityGroup = new aws.ec2.SecurityGroup(`${name}-frontend-sg`, {
    vpcId: vpc.id,
    description: "Frontend tasks: 3000 from the ALB only",
    ingress: [{protocol: "tcp", fromPort: 3000, toPort: 3000, securityGroups: [albSecurityGroup.id]}],
    egress: [{protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]}],
    tags: {Name: `${name}-frontend-sg`},
  });

  const dbSecurityGroup = new aws.ec2.SecurityGroup(`${name}-db-sg`, {
    vpcId: vpc.id,
    description: "RDS: 5432 from backend tasks only",
    // Operators reach RDS via ECS Exec into a backend task (see backend.ts);
    // the DB never accepts connections from outside the VPC.
    ingress: [{protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [backendSecurityGroup.id]}],
    egress: [{protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["::/0"]}],
    tags: {Name: `${name}-db-sg`},
  });

  return {
    vpc,
    publicSubnetIds: publicSubnets.map(s => s.id),
    albSecurityGroup,
    backendSecurityGroup,
    frontendSecurityGroup,
    dbSecurityGroup,
  };
}

export type Network = ReturnType<typeof createNetwork>;
