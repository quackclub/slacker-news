import {
  consolidateHTMLConverters,
  convertLexicalToHTML,
  defaultEditorConfig,
  defaultEditorFeatures
} from "@payloadcms/richtext-lexical";

export async function renderBody(lexicalData: unknown): Promise<string> {
  if (!lexicalData) {
    return "";
  }

  const html = await convertLexicalToHTML({
    converters: consolidateHTMLConverters({
      editorConfig: defaultEditorConfig as any,
      features: defaultEditorFeatures as any
    } as any),
    data: lexicalData
  } as any);

  return html;
}
