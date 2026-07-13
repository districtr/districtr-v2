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
      name: "rate-limit",
      priority: 1,
      action: {block: {}},
      statement: {rateBasedStatement: {limit: 2000, aggregateKeyType: "IP"}},
      visibilityConfig: visibility(`${name}-waf-rate-limit`),
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
      // ponytail: count mode — SizeRestrictions_BODY (8KB) would block large
      // msgpack saves. Flip to {none: {}} with ruleActionOverrides excluding
      // SizeRestrictions_BODY and CrossSiteScripting_BODY after CloudWatch soak.
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
