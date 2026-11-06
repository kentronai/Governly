"use client";

import { useEffect, useRef } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { errorToast } from "@/lib/utils/toast";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type Tool = {
  icon: LucideIcon;
  label: string;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
};

const GROUPS: Tool[][] = [
  [
    { icon: Undo2, label: "Undo", run: (e) => e.chain().focus().undo().run() },
    { icon: Redo2, label: "Redo", run: (e) => e.chain().focus().redo().run() },
  ],
  [
    {
      icon: Bold,
      label: "Bold",
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Italic",
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive("italic"),
    },
    {
      icon: Strikethrough,
      label: "Strikethrough",
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive("strike"),
    },
  ],
  [
    {
      icon: List,
      label: "Bullet list",
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Numbered list",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive("orderedList"),
    },
    {
      icon: Underline,
      label: "Underline",
      run: (e) => e.chain().focus().toggleUnderline().run(),
      active: (e) => e.isActive("underline"),
    },
    {
      icon: SupIcon,
      label: "Superscript",
      run: (e) => e.chain().focus().toggleSuperscript().run(),
      active: (e) => e.isActive("superscript"),
    },
    {
      icon: SubIcon,
      label: "Subscript",
      run: (e) => e.chain().focus().toggleSubscript().run(),
      active: (e) => e.isActive("subscript"),
    },
    {
      icon: RemoveFormatting,
      label: "Clear formatting",
      run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    {
      icon: Code,
      label: "Code",
      run: (e) => e.chain().focus().toggleCode().run(),
      active: (e) => e.isActive("code"),
    },
  ],
  [
    {
      icon: Quote,
      label: "Quote",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive("blockquote"),
    },
    {
      icon: Minus,
      label: "Divider",
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      icon: AlignLeft,
      label: "Align left",
      run: (e) => e.chain().focus().setTextAlign("left").run(),
      active: (e) => e.isActive({ textAlign: "left" }),
    },
    {
      icon: AlignCenter,
      label: "Align center",
      run: (e) => e.chain().focus().setTextAlign("center").run(),
      active: (e) => e.isActive({ textAlign: "center" }),
    },
    {
      icon: AlignRight,
      label: "Align right",
      run: (e) => e.chain().focus().setTextAlign("right").run(),
      active: (e) => e.isActive({ textAlign: "right" }),
    },
  ],
  [
    {
      icon: Link2,
      label: "Link",
      active: (e) => e.isActive("link"),
      run: (e) => {
        // ponytail: native prompt for the URL; swap for a Popover if it needs styling.
        const url = window.prompt(
          "Link URL",
          e.getAttributes("link").href ?? "https://",
        );
        if (url === null) return;
        if (url === "") e.chain().focus().unsetLink().run();
        else
          e.chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
      },
    },
    {
      icon: TableIcon,
      label: "Insert table",
      run: (e) =>
        e
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ],
];

const BLOCKS = [
  { value: "p", label: "Text" },
  { value: "1", label: "Heading 1" },
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Superscript,
      Subscript,
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Saved data usually arrives after the editor mounts: show it unless the user is typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (value === (editor.isEmpty ? "" : editor.getHTML())) return;
    editor.commands.setContent(value ?? "", { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const level = [1, 2, 3].find((l) =>
        editor.isActive("heading", { level: l }),
      );
      return {
        block: level ? String(level) : "p",
        active: GROUPS.flat().map((t) => t.active?.(editor) ?? false),
      };
    },
  });

  const insertImages = async (files: FileList | null) => {
    if (!editor || !files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        errorToast(`${file.name} is not an image`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errorToast(`${file.name} is larger than 2 MB`);
        continue;
      }
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  let toolIndex = 0;
  return (
    <div className="overflow-hidden rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/40 px-1 py-0.5">
        <Select
          value={state?.block ?? "p"}
          onValueChange={(v) => {
            if (!editor) return;
            if (v === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(v) as 1 | 2 | 3 })
                .run();
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-7 w-24 shrink-0 bg-background text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCKS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {GROUPS.map((group, g) => (
          <div key={g} className="flex shrink-0 items-center">
            <Separator orientation="vertical" className="mx-1 !h-4" />
            {group.map((tool) => {
              const active = state?.active[toolIndex++];
              return (
                <Button
                  key={tool.label}
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={active}
                  disabled={!editor}
                  className={cn(
                    "h-7 w-7 shrink-0",
                    active && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => editor && tool.run(editor)}
                >
                  <tool.icon className="h-3.5 w-3.5" />
                </Button>
              );
            })}
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Insert image"
          aria-label="Insert image"
          className="h-7 w-7 shrink-0"
          disabled={!editor}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => insertImages(e.target.files)}
        />
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "max-h-80 min-h-28 overflow-y-auto px-3 py-2 text-sm",
          "[&_.ProseMirror]:min-h-24 [&_.ProseMirror]:outline-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold",
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_hr]:my-3 [&_a]:text-primary [&_a]:underline",
          "[&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-ring",
          "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:p-1.5 [&_th]:p-1.5 [&_th]:bg-muted [&_th]:text-left",
        )}
      />
    </div>
  );
}
