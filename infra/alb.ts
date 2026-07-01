import * as aws from "@pulumi/aws";
import {config} from "./config";
import {Network} from "./network";

export function createAlb(network: Network) {
  const name = config.name;

  const alb = new aws.lb.LoadBalancer(`${name}-alb`, {
    name: `${name}-alb`,
    internal: false,
    loadBalancerType: "application",
    securityGroups: [network.albSecurityGroup.id],
    subnets: network.publicSubnetIds,
    // Slow exports / evaluation requests can exceed the 60s default. Target
    // keep-alives are set to 130s to stay above this (see Dockerfiles).
    idleTimeout: 120,
    enableDeletionProtection: config.isProd,
  });

  const backendTargetGroup = new aws.lb.TargetGroup(`${name}-backend-tg`, {
    name: `${name}-backend`,
    vpcId: network.vpc.id,
    port: 8080,
    protocol: "HTTP",
    targetType: "ip",
    deregistrationDelay: 30,
    healthCheck: {
      // GET / is a static 200 — deliberately not /db_is_alive, so a DB blip
      // doesn't make ECS cycle otherwise-healthy tasks.
      path: "/",
      matcher: "200",
      interval: 30,
      healthyThreshold: 2,
      unhealthyThreshold: 3,
    },
  });

  const frontendTargetGroup = new aws.lb.TargetGroup(`${name}-frontend-tg`, {
    name: `${name}-frontend`,
    vpcId: network.vpc.id,
    port: 3000,
    protocol: "HTTP",
    targetType: "ip",
    deregistrationDelay: 30,
    healthCheck: {
      path: "/",
      matcher: "200-399",
      interval: 30,
      healthyThreshold: 2,
      unhealthyThreshold: 3,
    },
  });

  const certificate = new aws.acm.Certificate(`${name}-cert`, {
    domainName: config.appDomain,
    subjectAlternativeNames: [config.apiDomain, ...config.extraDomains],
    validationMethod: "DNS",
  });

  // DNS is managed outside AWS: `pulumi up` pauses here until the validation
  // CNAMEs (exported as `dnsRecords`) are created at the DNS provider.
  const certificateValidation = new aws.acm.CertificateValidation(
    `${name}-cert-validation`,
    {certificateArn: certificate.arn},
    {customTimeouts: {create: "60m"}}
  );

  new aws.lb.Listener(`${name}-http`, {
    loadBalancerArn: alb.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "redirect",
        redirect: {port: "443", protocol: "HTTPS", statusCode: "HTTP_301"},
      },
    ],
  });

  const httpsListener = new aws.lb.Listener(`${name}-https`, {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
    certificateArn: certificateValidation.certificateArn,
    defaultActions: [{type: "forward", targetGroupArn: frontendTargetGroup.arn}],
  });

  // Operational endpoints stay reachable inside the VPC but not from the
  // internet.
  new aws.lb.ListenerRule(`${name}-block-internal`, {
    listenerArn: httpsListener.arn,
    priority: 1,
    conditions: [{pathPattern: {values: ["/metrics", "/_debug/*"]}}],
    actions: [
      {
        type: "fixed-response",
        fixedResponse: {contentType: "text/plain", statusCode: "403", messageBody: "Forbidden"},
      },
    ],
  });

  new aws.lb.ListenerRule(`${name}-api-host`, {
    listenerArn: httpsListener.arn,
    priority: 10,
    conditions: [{hostHeader: {values: [config.apiDomain]}}],
    actions: [{type: "forward", targetGroupArn: backendTargetGroup.arn}],
  });

  return {
    alb,
    backendTargetGroup,
    frontendTargetGroup,
    certificate,
    httpsListener,
  };
}

export type Alb = ReturnType<typeof createAlb>;
