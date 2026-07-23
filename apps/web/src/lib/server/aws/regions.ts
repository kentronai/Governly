/**
 * Resolves the AWS regions that need a deep agent scan.
 *
 * The configured region is always scanned. We also ask the account for its
 * enabled regions through EC2 DescribeRegions, then cheaply probe Bedrock's
 * ListAgents API in each region. Regions with Bedrock/AgentCore workloads are
 * promoted, while the configured region is always scanned for EC2 and other
 * explicitly tagged workloads.
 *
 * DescribeRegions uses AWS Query API directly so discovery does not need a
 * second heavyweight SDK package solely for this one account-level call.
 */

import { createHash, createHmac } from "node:crypto";
import {
  resolveAwsCredentials,
  type AwsCredentialIdentity,
  type DiscoveryConnectionRecord,
} from "./client-factory";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

async function describeEnabledRegions(
  requestRegion: string,
  credentials: AwsCredentialIdentity,
): Promise<string[]> {
  const service = "ec2";
  const host = `ec2.${requestRegion}.amazonaws.com`;
  const body = "Action=DescribeRegions&Version=2016-11-15&AllRegions=false";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host,
    "x-amz-date": amzDate,
  };
  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");

  const scope = `${dateStamp}/${requestRegion}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, requestRegion);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}/`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const xml = await response.text();
  if (!response.ok) {
    const code = xml.match(/<Code>([^<]+)<\/Code>/)?.[1];
    const message = xml.match(/<Message>([^<]+)<\/Message>/)?.[1];
    throw new Error(
      [code, message].filter(Boolean).join(": ") ||
        `DescribeRegions failed with HTTP ${response.status}`,
    );
  }

  const regions = Array.from(
    xml.matchAll(
      /<(?:\w+:)?regionName[^>]*>\s*([^<\s]+)\s*<\/(?:\w+:)?regionName>/gi,
    ),
  ).map((match) => match[1]);
  if (regions.length === 0) {
    throw new Error("DescribeRegions returned no enabled AWS regions");
  }
  return regions;
}

export interface DiscoveryRegionResolution {
  credentials: AwsCredentialIdentity;
  regions: string[];
  warning?: string;
}

export async function resolveDiscoveryRegions(
  connection: DiscoveryConnectionRecord,
): Promise<DiscoveryRegionResolution> {
  const credentials = await resolveAwsCredentials(connection);
  const configuredRegion = connection.region || "us-east-1";

  let enabledRegions: string[];
  let warning: string | undefined;
  try {
    enabledRegions = await describeEnabledRegions(
      configuredRegion,
      credentials,
    );
  } catch (error) {
    // Least-privilege discovery roles may omit ec2:DescribeRegions. The
    // configured region still remains fully functional in that case.
    enabledRegions = [configuredRegion];
    warning =
      error instanceof Error
        ? error.message
        : "Unable to enumerate AWS regions";
  }

  const uniqueRegions = Array.from(
    new Set([configuredRegion, ...enabledRegions]),
  );
  return {
    credentials,
    // EC2, Lambda and container-hosted agents can exist in any enabled
    // region even when Bedrock is unavailable there.
    regions: uniqueRegions,
    warning,
  };
}
