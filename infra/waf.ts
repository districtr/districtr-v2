import * as aws from "@pulumi/aws";
import {config} from "./config";
import {Alb} from "./alb";

export function createWaf(alb: Alb) {
  const name = config.name;

  const visibility = (metricName: string) => ({
    cloudwatchMetricsEnabled: true,
    sampledRequestsEnabled: true,
    metricName,
  });

  const rules: aws.types.input.wafv2.WebAclRule[] = [];

  // Host-header match per API hostname. WAF byte-match takes one string, so
  // several hosts have to be OR'd — and a one-element orStatement is invalid,
  // hence the single-host special case.
  const hostMatch = (host: string): aws.types.input.wafv2.WebAclRuleStatement => ({
    byteMatchStatement: {
      searchString: host,
      fieldToMatch: {singleHeader: {name: "host"}},
      positionalConstraint: "EXACTLY",
      textTransformations: [{priority: 0, type: "LOWERCASE"}],
    },
  });
  const apiHostScopeDown: aws.types.input.wafv2.WebAclRuleStatement =
    config.apiHosts.length === 1
      ? hostMatch(config.apiHosts[0])
      : {orStatement: {statements: config.apiHosts.map(hostMatch)}};

  if (config.wafAllowlistIps.length > 0) {
    const allowlist = new aws.wafv2.IpSet(`${name}-waf-allowlist`, {
      name: `${name}-waf-allowlist`,
      scope: "REGIONAL",
      ipAddressVersion: "IPV4",
      addresses: config.wafAllowlistIps,
    });
    rules.push({
      name: "allowlist",
      priority: 0,
      action: {allow: {}},
      statement: {ipSetReferenceStatement: {arn: allowlist.arn}},
      visibilityConfig: visibility(`${name}-waf-allowlist`),
    });
  }

  rules.push(
    {
      // Scoped to the API host: the same ALB serves the frontend, and page
      // loads (_next/static etc.) would otherwise count toward the limit and
      // let one classroom NAT block itself off the whole site.
      name: "rate-limit-api",
      priority: 1,
      action: {block: {}},
      statement: {
        rateBasedStatement: {
          limit: 10000,
          aggregateKeyType: "IP",
          // Every host the listener forwards to the backend, not just
          // apiDomain: an alias that routes to FastAPI but misses this scope
          // would only meet the 10k backstop, i.e. the API limit could be
          // sidestepped by calling the other name.
          scopeDownStatement: apiHostScopeDown,
        },
      },
      visibilityConfig: visibility(`${name}-waf-rate-limit-api`),
    },
    {
      // Coarse backstop for everything else the ALB serves (frontend pages
      // and assets) — high enough that shared-IP browsing never trips it.
      name: "rate-limit-any",
      priority: 5,
      action: {block: {}},
      statement: {rateBasedStatement: {limit: 50000, aggregateKeyType: "IP"}},
      visibilityConfig: visibility(`${name}-waf-rate-limit-any`),
    },
    {
      name: "aws-ip-reputation",
      priority: 2,
      overrideAction: {none: {}},
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesAmazonIpReputationList",
        },
      },
      visibilityConfig: visibility(`${name}-waf-ip-reputation`),
    },
    {
      name: "aws-known-bad-inputs",
      priority: 3,
      overrideAction: {none: {}},
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesKnownBadInputsRuleSet",
        },
      },
      visibilityConfig: visibility(`${name}-waf-known-bad-inputs`),
    },
    {
      name: "aws-common",
      priority: 4,
      overrideAction: {count: {}},
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesCommonRuleSet",
        },
      },
      visibilityConfig: visibility(`${name}-waf-common`),
    }
  );

  const webAcl = new aws.wafv2.WebAcl(`${name}-waf`, {
    name: `${name}-waf`,
    scope: "REGIONAL",
    defaultAction: {allow: {}},
    rules,
    visibilityConfig: visibility(`${name}-waf`),
  });

  new aws.wafv2.WebAclAssociation(`${name}-waf-assoc`, {
    resourceArn: alb.alb.arn,
    webAclArn: webAcl.arn,
  });

  return {webAcl};
}

export type Waf = ReturnType<typeof createWaf>;
