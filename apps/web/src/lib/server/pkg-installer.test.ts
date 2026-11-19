import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { addFileToPkgScripts, governlyConfigPlist } from "./pkg-installer";

const TEMPLATE = path.join(__dirname, "../../../public/downloads/Governly-ShadowAI.pkg");

describe("addFileToPkgScripts", () => {
  it("adds the config to Scripts and keeps the xar checksums valid", () => {
    const out = addFileToPkgScripts(fs.readFileSync(TEMPLATE), "governly.plist", governlyConfigPlist("https://a.test", "sk_live_x"));
    const tocLen = Number(out.readBigUInt64BE(8));
    const tocZ = out.subarray(28, 28 + tocLen);
    const heap = out.subarray(28 + tocLen);
    expect(heap.subarray(0, 20).equals(crypto.createHash("sha1").update(tocZ).digest())).toBe(true);

    const toc = zlib.inflateSync(tocZ).toString();
    const block = toc.match(/<file id="\d+">[\s\S]*?<\/file>/g)!.find((b) => b.includes("<name>Scripts</name>"))!;
    const data = /<data>[\s\S]*?<\/data>/.exec(block)![0];
    const n = (t: string) => Number(new RegExp(`<${t}>(\\d+)</${t}>`).exec(data)![1]);
    const scripts = heap.subarray(n("offset"), n("offset") + n("length"));
    expect(data).toContain(crypto.createHash("sha1").update(scripts).digest("hex"));
    const cpio = zlib.gunzipSync(scripts).toString("latin1");
    expect(cpio).toContain("./postinstall");
    expect(cpio).toContain("<string>sk_live_x</string>");
  });
});
