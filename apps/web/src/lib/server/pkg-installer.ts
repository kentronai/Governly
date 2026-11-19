import crypto from "crypto";
import zlib from "zlib";

/**
 * Adds one file to the Scripts of a flat macOS .pkg (a xar archive), so each
 * download carries its tenant's Governly URL + key and needs no Jamf profile.
 * The postinstall script copies that file into place.
 *
 * ponytail: rewrites only the Scripts entry of an UNSIGNED pkg built by
 * deploy/shadow-ai-pkg/build.sh. A signed pkg would need re-signing, which
 * Linux can't do; sign on a Mac and ship per-tenant config differently then.
 */

const sha1 = (b: Buffer) => crypto.createHash("sha1").update(b).digest("hex");

/** One entry of an "odc" cpio archive (the format pkgbuild uses for Scripts). */
function cpioEntry(name: string, mode: number, data: Buffer): Buffer {
  const oct = (n: number, w: number) => n.toString(8).padStart(w, "0");
  const nameBuf = Buffer.from(name + "\0");
  const header =
    "070707" + oct(0, 6) + oct(0, 6) + oct(mode, 6) + oct(0, 6) + oct(0, 6) + oct(1, 6) +
    oct(0, 6) + oct(Math.floor(Date.now() / 1000), 11) + oct(nameBuf.length, 6) + oct(data.length, 11);
  return Buffer.concat([Buffer.from(header, "ascii"), nameBuf, data]);
}

/** Inserts `file` before the cpio TRAILER!!! entry. */
function addToCpio(cpio: Buffer, name: string, file: Buffer): Buffer {
  const trailer = cpio.lastIndexOf(Buffer.from("TRAILER!!!")) - 76; // odc header is 76 bytes
  if (trailer < 0 || cpio.toString("ascii", trailer, trailer + 6) !== "070707") {
    throw new Error("Scripts is not a cpio archive");
  }
  return Buffer.concat([
    cpio.subarray(0, trailer),
    cpioEntry(name, 0o100644, file),
    cpioEntry("TRAILER!!!", 0, Buffer.alloc(0)),
  ]);
}

export function addFileToPkgScripts(pkg: Buffer, name: string, file: Buffer): Buffer {
  if (pkg.toString("ascii", 0, 4) !== "xar!") throw new Error("not a xar archive");
  const headerSize = pkg.readUInt16BE(4);
  const tocLen = Number(pkg.readBigUInt64BE(8));
  let toc = zlib.inflateSync(pkg.subarray(headerSize, headerSize + tocLen)).toString("utf8");
  const heap = pkg.subarray(headerSize + tocLen);

  // The Scripts <file> block and its <data> location in the heap.
  // Field order inside <file> varies, so pick the block whose name is Scripts (flat pkgs don't nest files).
  const fileBlock = toc.match(/<file id="\d+">[\s\S]*?<\/file>/g)?.find((b) => b.includes("<name>Scripts</name>"));
  if (!fileBlock) throw new Error("pkg has no Scripts");
  const dataBlock = /<data>[\s\S]*?<\/data>/.exec(fileBlock)!;
  const num = (tag: string) => Number(new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(dataBlock[0])![1]);
  if (!dataBlock[0].includes("application/octet-stream")) throw new Error("unexpected Scripts encoding");
  const oldArchived = heap.subarray(num("offset"), num("offset") + num("length"));

  const cpio = addToCpio(zlib.gunzipSync(oldArchived), `./${name}`, file);
  const archived = zlib.gzipSync(cpio);
  // pkgbuild stores Scripts as an already-gzipped cpio with xar encoding octet-stream.
  const newData =
    `<data>\n    <archived-checksum style="sha1">${sha1(archived)}</archived-checksum>\n` +
    `    <extracted-checksum style="sha1">${sha1(archived)}</extracted-checksum>\n` +
    `    <encoding style="application/octet-stream"/>\n    <size>${archived.length}</size>\n` +
    `    <offset>${heap.length}</offset>\n    <length>${archived.length}</length>\n   </data>`;
  toc = toc.replace(fileBlock, fileBlock.replace(dataBlock[0], newData));

  // The old Scripts bytes stay in the heap unreferenced; the new ones go at the end.
  const tocZ = zlib.deflateSync(Buffer.from(toc, "utf8"));
  const newHeap = Buffer.concat([heap, archived]);
  crypto.createHash("sha1").update(tocZ).digest().copy(newHeap, 0); // TOC checksum lives at heap offset 0

  const header = Buffer.from(pkg.subarray(0, headerSize));
  header.writeBigUInt64BE(BigInt(tocZ.length), 8);
  header.writeBigUInt64BE(BigInt(Buffer.byteLength(toc)), 16);
  return Buffer.concat([header, tocZ, newHeap]);
}

/** The config plist the scanner reads (see SETTINGS_FILES in public/shadow-ai-scan.py). */
export function governlyConfigPlist(url: string, token: string): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
      `<plist version="1.0"><dict><key>url</key><string>${esc(url)}</string>` +
      `<key>token</key><string>${esc(token)}</string></dict></plist>\n`,
  );
}
