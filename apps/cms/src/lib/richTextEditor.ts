import { lexicalEditor } from "@payloadcms/richtext-lexical";

// Reuse the same lexical editor setup everywhere the rich-text field is used.
export const richTextEditor = lexicalEditor({});
