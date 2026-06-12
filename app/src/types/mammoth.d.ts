/**
 * Minimal type declarations for `mammoth/mammoth.browser` (it ships no types).
 * Only the DOCX -> HTML conversion surface we use is declared here.
 * @see https://github.com/mwilliamson/mammoth.js
 */
declare module 'mammoth/mammoth.browser' {
  export interface ConvertInput {
    arrayBuffer: ArrayBuffer;
  }

  export interface ConvertMessage {
    type: string;
    message: string;
  }

  export interface ConvertResult {
    value: string;
    messages: ConvertMessage[];
  }

  export function convertToHtml(
    input: ConvertInput,
    options?: Record<string, unknown>,
  ): Promise<ConvertResult>;

  export function extractRawText(input: ConvertInput): Promise<ConvertResult>;
}
