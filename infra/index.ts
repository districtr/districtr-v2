import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("districtr-cdn-data", {});
// oai
const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity('districtr-cdn-data-oai', {
  comment: 'Origin Access Identity for Districtr CDN Data.',
});

// bucket policy
const _bucketPolicy = new aws.s3.BucketPolicy('districtr-cdn-data-bucketPolicy', {
  bucket: bucket.bucket,
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: originAccessIdentity.iamArn
        },
        Action: "s3:GetObject",
        Resource: pulumi.interpolate`${bucket.arn}/*`
      }
    ]
  }
});
// cors config
const _bucketCors = new aws.s3.BucketCorsConfigurationV2('bucketCors', {
  bucket: bucket.bucket,
  corsRules: [
    {
      allowedHeaders: ["*"],
      allowedMethods: ["GET"],
      allowedOrigins: ["*"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3000
    }
  ]
});

const bucketBlockPublicAccess = new aws.s3.BucketPublicAccessBlock('bucketBlockPublicAccess', {
  bucket: bucket.bucket,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Create a CloudFront distribution to serve the website
const cdn = new aws.cloudfront.Distribution('cdn', {
  enabled: true,
  waitForDeployment: true,
  isIpv6Enabled: true,
  origins: [
    {
      originId: bucket.id,
      domainName: bucket.bucketRegionalDomainName,
      s3OriginConfig: {
        originAccessIdentity: originAccessIdentity.cloudfrontAccessIdentityPath,
      },
    },
  ],
  defaultCacheBehavior: {
    compress: true,
    allowedMethods: ['HEAD','GET','OPTIONS'],
    cachedMethods: ['HEAD', 'GET', 'OPTIONS'],
    forwardedValues: {
      cookies: {
        forward: 'none'
      },
      headers: ['Accept', 'Accept-Language'],
      queryString: false
    },
    targetOriginId: bucket.id,
    viewerProtocolPolicy: 'allow-all'
  },
  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
  },
  httpVersion: "http2",
  restrictions: {
    geoRestriction: {
      restrictionType: "none",
    },
  },
});