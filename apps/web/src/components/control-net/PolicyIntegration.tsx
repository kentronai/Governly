import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Check, Copy } from "lucide-react";
import { successToast } from "@/lib/utils/toast";

import { FaPython, FaNodeJs } from "react-icons/fa";
import { SiCurl } from "react-icons/si";
import { useParams } from "next/navigation";
import { getGatewayBaseUrl } from "@/lib/utils/gatewayUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Two ways to put NORIX in front of a model, and they are not equivalent.
 *
 * `check` — NORIX rules on the message and the customer calls their own LLM
 * with their own key. NORIX never sees a provider credential and never makes an
 * inference call, so a provider outage, an expired key or a model-registry
 * mistake cannot take the customer's chatbot down. This is the product.
 *
 * `proxy` — NORIX forwards to a provider on the customer's behalf. Convenient
 * for a drop-in OpenAI SDK swap, but it couples the customer's uptime to our
 * routing configuration.
 */
type IntegrationMode = "check" | "proxy";

export default function PolicyIntegration({
  selectedPolicy,
}: {
  selectedPolicy: string;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<IntegrationMode>("check");
  const { applicationId } = useParams();
  // Set after mount: the origin is only known in the browser, and rendering it
  // during SSR would cause a hydration mismatch.
  const [baseURL, setBaseURL] = useState("");
  useEffect(() => setBaseURL(getGatewayBaseUrl()), []);

  const policyId = selectedPolicy || "policy-uuid-here";
  const appId = String(applicationId || "application-uuid-here");

  const buildCheckSnippet = (type: string, requestURL: string) => {
    if (type === "CURL") {
      return `curl ${requestURL}/v1/guard/check \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: sk_test_YOUR_CONTROLNET_KEY" \\
  -H "X-Policy-ID: ${policyId}" \\
  -H "X-Application-ID: ${appId}" \\
  -d '{"input": "Hello!"}'

# → {"allowed": true,  "decision": "allow", "violation": null}
# → {"allowed": false, "decision": "block", "violation": {"rule_id": "toxicity.detect", ...}}`;
    }

    if (type === "PYTHON") {
      return `import requests
from openai import OpenAI

NORIX = "${requestURL}/v1/guard/check"
NORIX_HEADERS = {
    "X-API-KEY": "sk_test_YOUR_CONTROLNET_KEY",
    "X-Policy-ID": "${policyId}",
    "X-Application-ID": "${appId}",
}

# Your own LLM, your own key. NORIX never sees either.
llm = OpenAI(api_key="sk-proj-YOUR_OWN_KEY")


def answer(user_message: str) -> str:
    # 1. Ask NORIX whether this message is allowed by your policy.
    verdict = requests.post(
        NORIX, headers=NORIX_HEADERS, json={"input": user_message}
    ).json()

    if not verdict["allowed"]:
        return f"Blocked by policy: {verdict['violation']['message']}"

    # 2. Allowed — call your own model yourself.
    reply = llm.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": user_message}],
    )
    return reply.choices[0].message.content`;
    }

    return `import OpenAI from 'openai';

const NORIX = '${requestURL}/v1/guard/check';
const NORIX_HEADERS = {
  'Content-Type': 'application/json',
  'X-API-KEY': process.env.CONTROLNET_API_KEY,
  'X-Policy-ID': '${policyId}',
  'X-Application-ID': '${appId}',
};

// Your own LLM, your own key. NORIX never sees either.
const llm = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function answer(userMessage) {
  // 1. Ask NORIX whether this message is allowed by your policy.
  const res = await fetch(NORIX, {
    method: 'POST',
    headers: NORIX_HEADERS,
    body: JSON.stringify({ input: userMessage }),
  });
  const verdict = await res.json();

  if (!verdict.allowed) {
    return \`Blocked by policy: \${verdict.violation.message}\`;
  }

  // 2. Allowed — call your own model yourself.
  const reply = await llm.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: userMessage }],
  });
  return reply.choices[0].message.content;
}`;
  };

  const buildProxySnippet = (type: string, requestURL: string) => {
    if (type === "CURL") {
      return `curl ${requestURL}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: sk_test_YOUR_CONTROLNET_KEY" \\
  -H "Authorization: Bearer sk-proj-YOUR_PROVIDER_KEY" \\
  -H "X-Policy-ID: ${policyId}" \\
  -H "X-Application-ID: ${appId}" \\
  -H "X-Agent-ID: OPTIONAL_DISCOVERED_AGENT_UUID" \\
  -d '{
    "model": "your-model-id",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;
    }

    if (type === "PYTHON") {
      return `from openai import OpenAI

# ControlNet Proxy Integration (OpenAI SDK Compatible)
client = OpenAI(
    api_key="sk-proj-YOUR_PROVIDER_KEY",  # Your provider key (BYOK)
    base_url="${requestURL}/v1",
    default_headers={
        "X-API-KEY": "sk_test_YOUR_CONTROLNET_KEY",
        "X-Policy-ID": '${policyId}',
        "X-Application-ID": "${appId}",
        "X-Agent-ID": "OPTIONAL_DISCOVERED_AGENT_UUID",
    }
)

# Use exactly like normal OpenAI - guardrails applied automatically
response = client.chat.completions.create(
    model="your-model-id",
    messages=[{"role": "user", "content": "Hello!"}]
)`;
    }

    return `import OpenAI from 'openai';

// ControlNet Proxy Integration (OpenAI SDK Compatible)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // Your provider key (BYOK)
  baseURL: '${requestURL}/v1',
  defaultHeaders: {
    'X-API-KEY': process.env.CONTROLNET_API_KEY,
    'X-Policy-ID': '${policyId}',
    'X-Application-ID': '${appId}',
    'X-Agent-ID': 'OPTIONAL_DISCOVERED_AGENT_UUID',
  }
});

// Use exactly like normal OpenAI - guardrails applied automatically
const response = await client.chat.completions.create({
  model: 'your-model-id',
  messages: [{ role: 'user', content: 'Hello!' }]
});`;
  };

  const handleCopy = async (type: string) => {
    try {
      // Resolved on click so the snippet always points at the origin the user
      // is actually on (app.kentron.ai, staging, localhost, …).
      const requestURL = getGatewayBaseUrl();
      const data =
        mode === "check"
          ? buildCheckSnippet(type, requestURL)
          : buildProxySnippet(type, requestURL);

      await navigator.clipboard.writeText(data);
      setCopied(true);
      successToast("", "", "", "Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const languages = [
    { id: "PYTHON", label: "Python", icon: <FaPython size={15} /> },
    { id: "NODEJS", label: "JavaScript", icon: <FaNodeJs size={15} /> },
    { id: "CURL", label: "Curl", icon: <SiCurl size={15} /> },
  ];

  return (
    <div className="relative mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xl font-semibold">Integration</h4>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as IntegrationMode)}>
        <TabsList>
          <TabsTrigger value="check">Policy check</TabsTrigger>
          <TabsTrigger value="proxy">Proxy through NORIX</TabsTrigger>
        </TabsList>

        <TabsContent value="check" className="mt-3">
          <p className="text-sm text-muted-foreground">
            NORIX returns <span className="font-mono">allowed: true/false</span>{" "}
            and your application calls its own LLM with its own key. NORIX never
            handles your provider credentials, so nothing on our side can break
            your chatbot.
          </p>
        </TabsContent>

        <TabsContent value="proxy" className="mt-3">
          <p className="text-sm text-muted-foreground">
            NORIX forwards the request to a model provider for you. A drop-in
            swap for the OpenAI SDK, but your traffic then depends on the model
            selected in Model Registry and on the provider key you send.
          </p>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start ">
        <div className="space-y-2 h-full  w-full border bg-muted p-3 rounded-lg">
          <div className="flex justify-between items-center ">
            <h3 className="font-semibold text-md">Required Headers</h3>
            <Button variant="outline" size="sm" className="h-8 px-2">
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="p-4 rounded-lg space-y-2 text-sm font-mono">
            <div>
              <span className="text-muted-foreground">Endpoint:</span>{" "}
              <span className="">
                {baseURL
                  ? `${baseURL}/v1${mode === "check" ? "/guard/check" : "/chat/completions"}`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">X-API-KEY:</span>{" "}
              <span className="">Your ControlNet API Key</span>
            </div>
            {mode === "proxy" ? (
              <div>
                <span className="text-muted-foreground">Authorization:</span>{" "}
                <span className="">Bearer YOUR_PROVIDER_KEY (BYOK)</span>
              </div>
            ) : (
              <div>
                <span className="text-muted-foreground">Authorization:</span>{" "}
                <span className="">Not required — NORIX calls no model</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">X-Policy-ID:</span>{" "}
              <span className="">{policyId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">X-Application-ID:</span>{" "}
              <span className="">{appId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">X-Agent-ID:</span>{" "}
              <span className="">Optional discovered agent UUID</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 h-full w-full border bg-muted p-3 rounded-lg">
          <div className="flex justify-between items-center ">
            <h3 className="font-semibold text-md">Copy API Code</h3>
          </div>
          <div className=" p-4 rounded-lg space-y-2 ">
            {languages.map((language) => (
              <div
                key={language.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 ">
                  {language.icon}
                  <span className="">{language.label}</span>
                </div>
                <Copy
                  className="cursor-pointer"
                  size={15}
                  onClick={() => handleCopy(language.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
